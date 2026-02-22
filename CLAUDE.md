# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A semantic codebase indexer that uses Ollama embeddings + Qdrant vector DB. It runs as an MCP server for Claude Code integration, and also provides a standalone CLI. Written in TypeScript/Node.js, designed for `npx` execution.

## Build & Run

```bash
npm run build          # tsc → dist/
npm run dev            # tsx watch mode (auto-rebuild)
npm start              # node dist/index.js

# CLI commands
node dist/index.js init                          # Start Qdrant Docker + check Ollama
node dist/index.js index ./path --setup-claude                 # Index + write CLAUDE.md and .mcp.json
node dist/index.js index ./path --setup-codex                  # Index + write AGENTS.md and .codex/config.toml
node dist/index.js index ./path --setup-claude --setup-codex   # Configure both
node dist/index.js index ./path --setup                         # Interactive setup selection (Claude/Codex)
node dist/index.js index ./path --setup --setup-globally       # Global MCP setup (~/.claude.json, ~/.codex/config.toml)
node dist/index.js search "query" -k 5           # Semantic search
node dist/index.js status                        # Health check
node dist/index.js --dir ./path                  # Start MCP server (default mode, no subcommand)
```

No test suite or linter is configured yet.

## Architecture

The system has a pipeline architecture: **discover files → chunk code → embed via Ollama → store in Qdrant**.

```
index.ts (CLI entry, commander.js)
  → cli/commands.ts (command handlers)
    → core/indexer.ts (orchestrator - the central module everything flows through)
      → core/chunker.ts (symbol-based splitting, sliding window fallback)
      → core/embedder.ts (Ollama /api/embed client, MRL truncation + L2 normalize)
      → core/vectorstore.ts (Qdrant client wrapper, cosine similarity search)
  → mcp/server.ts (MCP stdio transport, exposes 5 tools)
  → watcher/watcher.ts (chokidar, 500ms debounce, feeds back into indexer)
```

**Key design decisions:**
- `Indexer` class is the single orchestrator — CLI commands, MCP tools, and the file watcher all go through it
- Chunking uses a dual strategy: symbol-based regex patterns (functions/classes) tried first, sliding window fallback if symbols cover <50% of file
- Embeddings are batch-processed (default 16 chunks/request) with `p-limit` concurrency (default 4 files parallel)
- Incremental indexing: file content MD5 stored in Qdrant payload, unchanged files are skipped
- Chunk IDs are deterministic: `MD5(filePath:startLine:endLine)`
- MCP mode uses stdio transport — stdout is reserved for JSON-RPC, all logging goes to stderr

**Config resolution order:** CLI args → env vars (`OLLAMA_URL`, `QDRANT_URL`, `EMBEDDING_MODEL`, `EMBEDDING_DIM`, `COLLECTION_NAME`) → hardcoded defaults in `config/config.ts`.

## Module Responsibilities

- **`core/chunker.ts`**: Has `SYMBOL_PATTERNS` dict with regex patterns for 18 languages. Adding a new language means adding an entry there. The `chunkFile()` function is the public API.
- **`core/embedder.ts`**: Wraps Ollama's `/api/embed` endpoint. Does MRL truncation (slices vector to `embeddingDim`) then L2-normalizes. Has retry with exponential backoff (3 attempts).
- **`core/vectorstore.ts`**: Qdrant operations. Creates payload indices on `file_path`, `language`, `chunk_type` for filtered search. Uses `@qdrant/js-client-rest`.
- **`mcp/server.ts`**: Uses `@modelcontextprotocol/sdk`. Zod schemas for tool params (via `z` imported from the SDK). Five tools: `search_code`, `index_file`, `index_directory`, `get_index_status`, `delete_file`.
- **`utils/files.ts`**: `discoverFiles()` uses glob + `ignore` library for .gitignore support. `getLanguageFromExtension()` maps 70+ extensions.
- **`cli/commands.ts`**: The setup flags on `index` (`--setup-claude`, `--setup-codex`, `--setup`, `--setup-globally`) write assistant usage guidance into `CLAUDE.md`/`AGENTS.md` and upsert MCP configs in local or global scope.

## Conventions

- ESM throughout (`"type": "module"` in package.json), all local imports use `.js` extension
- Strict TypeScript, Node16 module resolution
- No barrel exports — import directly from each module file
- Qdrant payload fields use `snake_case`, TypeScript interfaces use `camelCase`

<!-- codebase-indexer:start -->
## Codebase Semantic Search (MCP: codebase-indexer)

This project has a semantic code search index powered by Ollama embeddings and Qdrant vector DB, exposed as an MCP server.

### When to use

- **Before exploring unfamiliar code**: Use `search_code` to find relevant files and functions instead of manually grepping. This is especially useful in large codebases.
- **When implementing a feature**: Search for existing patterns, similar implementations, or related utilities (e.g., `search_code("authentication middleware")`).
- **When fixing a bug**: Search for the error message, function name, or concept to quickly locate relevant code.
- **When refactoring**: Find all code related to a concept across the entire codebase semantically, not just by exact text match.

### Available tools

| Tool | Purpose | Example |
|------|---------|---------|
| `search_code` | Semantic search across the codebase | `search_code({query: "database connection pooling", top_k: 5})` |
| `search_code` with filters | Narrow results by language or path | `search_code({query: "error handling", language: "typescript", file_path_prefix: "src/api/"})` |
| `index_file` | Index/re-index a single file | `index_file({path: "src/new-module.ts"})` |
| `index_directory` | Re-index the full project (incremental) | `index_directory({})` |
| `get_index_status` | Check if services are healthy | `get_index_status({})` |
| `delete_file` | Remove a deleted file from the index | `delete_file({path: "src/old-module.ts"})` |

### Tips

- `search_code` uses natural language — describe what you're looking for conceptually, not just keywords.
- The index updates automatically when files change (file watcher is enabled).
- If search results seem stale, run `index_directory` to force a re-index.
- Use `file_path_prefix` filter to scope searches to specific directories.

### Configuration

- Ollama: `http://localhost:11434`
- Qdrant: `http://localhost:6333`
- Model: `qwen3-embedding:0.6b` (dim: 512)
- Collection: `codebase`
<!-- codebase-indexer:end -->
