# codebase-indexer

```
    /\_/\   codebase-indexer
   ( •.•)  ─────────────────
 ⊂/ 🌰 \⊃  Semantic code search
  /|   |\   powered by AI
```

A semantic codebase indexer that chunks your source code, generates embeddings via [Ollama](https://ollama.com), and stores them in [Qdrant](https://qdrant.tech) for natural-language code search. Ships as an [MCP](https://modelcontextprotocol.io) server for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) and [Codex](https://openai.com/index/introducing-codex/) integration, and also works as a standalone CLI.

## Features

- **Semantic search** — find code by meaning, not just keywords (`"retry logic with exponential backoff"`)
- **18 languages** with symbol-aware chunking (functions, classes, interfaces, etc.)
- **70+ file extensions** recognized
- **Incremental indexing** — only re-indexes changed files (MD5 content hashing)
- **MCP server** — plug directly into Claude Code or Codex as a tool provider
- **File watcher** — auto-reindex on save (500ms debounce)
- **Interactive CLI** — squirrel mascot, spinners, colored output
- **Zero config** — sensible defaults, works out of the box with `npx`

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org) >= 18
- [Docker](https://www.docker.com) (for Qdrant)
- [Ollama](https://ollama.com) running locally

### 1. Set up infrastructure

```bash
npx codebase-indexer init
```

This starts a Qdrant container via Docker Compose, verifies your Ollama connection, and pulls the embedding model if needed.

### 2. Index your project

```bash
npx codebase-indexer index ./your-project
```

### 3. Search

```bash
npx codebase-indexer search "authentication middleware"
```

### 4. Use with Claude Code or Codex

```bash
# Set up Claude Code integration (writes CLAUDE.md + .mcp.json)
npx codebase-indexer index ./your-project --setup-claude

# Set up Codex integration (writes AGENTS.md + .codex/config.toml)
npx codebase-indexer index ./your-project --setup-codex

# Set up both interactively
npx codebase-indexer index ./your-project --setup

# Global MCP setup (user-level config files)
npx codebase-indexer index ./your-project --setup --setup-globally
```

## CLI Reference

### Global Options

| Option | Default | Description |
|--------|---------|-------------|
| `--ollama-url <url>` | `http://localhost:11434` | Ollama API URL |
| `--qdrant-url <url>` | `http://localhost:6333` | Qdrant API URL |
| `--model <name>` | `qwen3-embedding:0.6b` | Embedding model name |
| `--dim <number>` | `512` | Embedding vector dimension |
| `--dir <path>` | `.` | Directory to index/watch |
| `--collection <name>` | `codebase` | Qdrant collection name |
| `--no-watch` | — | Disable file watching in MCP mode |

### Commands

#### `init`

Set up Qdrant (Docker) and check Ollama connection.

```bash
codebase-indexer init
```

- Creates `~/.codebase-indexer/docker-compose.yml`
- Starts Qdrant container (`qdrant/qdrant:latest`)
- Waits for health check (30s timeout)
- Verifies Ollama and auto-pulls the embedding model

#### `index [directory]`

Index a directory for semantic search.

```bash
codebase-indexer index ./my-project [options]
```

| Option | Description |
|--------|-------------|
| `--setup` | Interactively choose setup targets (Claude/Codex) |
| `--setup-claude` | Write `CLAUDE.md` + `.mcp.json` for Claude Code |
| `--setup-codex` | Write `AGENTS.md` + `.codex/config.toml` for Codex |
| `--setup-globally` | Write MCP config to user-level files instead of project-local |
| `--force` | Re-index all files, ignoring cached hashes |

#### `search <query>`

Semantic search across the indexed codebase.

```bash
codebase-indexer search "database connection pooling" -k 5
codebase-indexer search "error handling" -l typescript
```

| Option | Default | Description |
|--------|---------|-------------|
| `-k, --top-k <number>` | `10` | Number of results |
| `-l, --language <lang>` | — | Filter by language |

#### `status`

Check health of Ollama and Qdrant, show index statistics.

```bash
codebase-indexer status
```

#### `config`

Interactively edit persistent settings.

```bash
codebase-indexer config
```

Opens an interactive menu to edit Ollama URL, Qdrant URL, embedding model, dimension, and collection name. Settings are saved to `~/.codebase-indexer/config.json` and loaded by all commands automatically.

#### Default (no subcommand)

Start the MCP server over stdio.

```bash
codebase-indexer --dir ./my-project
```

## MCP Server

When run without a subcommand (or via an MCP config), codebase-indexer starts as an MCP server using stdio JSON-RPC transport. It exposes five tools:

| Tool | Description |
|------|-------------|
| `search_code` | Semantic search with optional `language` and `file_path_prefix` filters |
| `index_file` | Index or re-index a single file |
| `index_directory` | Incrementally index an entire directory |
| `get_index_status` | Health check and index statistics |
| `delete_file` | Remove a file from the index |

### Example `.mcp.json`

```json
{
  "mcpServers": {
    "codebase-indexer": {
      "command": "npx",
      "args": ["codebase-indexer", "--dir", "/absolute/path/to/project"]
    }
  }
}
```

### Example usage in Claude Code

```
search_code({ query: "retry logic with exponential backoff", top_k: 5 })
search_code({ query: "error handling", language: "typescript", file_path_prefix: "src/api/" })
index_file({ path: "src/new-module.ts" })
index_directory({})
get_index_status({})
delete_file({ path: "src/old-module.ts" })
```

## Configuration

Settings are resolved in this order (last wins):

```
Hardcoded defaults → ~/.codebase-indexer/config.json → Environment variables → CLI flags
```

### Environment Variables

| Variable | Maps to |
|----------|---------|
| `OLLAMA_URL` | `--ollama-url` |
| `QDRANT_URL` | `--qdrant-url` |
| `EMBEDDING_MODEL` | `--model` |
| `EMBEDDING_DIM` | `--dim` |
| `COLLECTION_NAME` | `--collection` |

### Persistent Config

Run `codebase-indexer config` to interactively set values, or manually create `~/.codebase-indexer/config.json`:

```json
{
  "ollamaUrl": "http://localhost:11434",
  "qdrantUrl": "http://localhost:6333",
  "model": "qwen3-embedding:0.6b",
  "embeddingDim": 512,
  "collectionName": "codebase"
}
```

### Collection Name Auto-Derivation

When using the default collection name (`codebase`) and indexing a specific directory, the collection name is automatically derived from the directory name:

```bash
codebase-indexer index ./my-cool-project
# → collection: "codebase-my-cool-project"
```

## Architecture

```
index.ts (CLI entry, commander.js)
  → cli/commands.ts (command handlers)
    → core/indexer.ts (orchestrator)
      → core/chunker.ts (symbol-based splitting, sliding window fallback)
      → core/embedder.ts (Ollama /api/embed client, MRL truncation + L2 normalize)
      → core/vectorstore.ts (Qdrant client, cosine similarity search)
  → mcp/server.ts (MCP stdio transport, 5 tools)
  → watcher/watcher.ts (chokidar, 500ms debounce, feeds into indexer)
```

### Pipeline

```
Discover files → Chunk code → Embed via Ollama → Store in Qdrant
```

1. **File discovery** — uses `git ls-files` (fast, respects `.gitignore`) with glob fallback. Filters by 54 code extensions, skips lock files, respects size limits (1 MB default).

2. **Chunking** — dual strategy per file:
   - **Symbol-based**: regex patterns detect functions, classes, interfaces, etc. for 18 languages
   - **Sliding window fallback**: used when symbols cover <50% of the file. Default 1500 chars with 200-char overlap.

3. **Embedding** — batches of 16 chunks sent to Ollama's `/api/embed` endpoint. Vectors are MRL-truncated to the target dimension and L2-normalized. Retry with exponential backoff (3 attempts).

4. **Storage** — chunks upserted to Qdrant with deterministic IDs (`MD5(path:startLine:endLine)`). Payload indices on `file_path`, `language`, and `chunk_type` for filtered search. Cosine similarity.

5. **Incremental indexing** — each file's content hash is stored in the Qdrant payload. On re-index, unchanged files are skipped entirely.

### Supported Languages (Symbol Detection)

| Language | Detected Symbols |
|----------|-----------------|
| TypeScript | functions, classes, interfaces, types, enums, arrow functions |
| JavaScript | functions, classes, arrow functions, module.exports |
| Python | functions, classes |
| Go | functions, types (struct, interface) |
| Rust | functions, structs, enums, traits, impl blocks |
| Java | classes, interfaces, methods |
| Kotlin | functions, classes, interfaces, objects |
| Ruby | functions, classes, modules |
| PHP | functions, classes, interfaces, traits |
| Swift | functions, classes, structs, protocols, enums |
| C# | methods, classes, interfaces |
| Scala | functions, classes, traits, objects |
| C | functions, structs, typedefs |
| C++ | functions, classes, structs, namespaces, templates |
| Elixir | functions, private functions, modules |
| Haskell | type signatures, data types, classes, instances |
| Dart | functions, classes, mixins |
| Zig | functions, const structs |

All other recognized file types fall back to sliding window chunking.

### File Watcher

In MCP mode, the file watcher is enabled by default:

- Watches for file `add`, `change`, and `unlink` events
- 500ms debounce before processing
- 300ms write-finish stability detection
- Batch processing with retry (max 3 attempts, exponential backoff)
- Automatically re-indexes modified files and removes deleted ones

Disable with `--no-watch`.

## Development

```bash
git clone https://github.com/ygtdgn/codebase-indexer.git
cd codebase-indexer
npm install
npm run dev     # tsx watch mode (auto-rebuild on save)
```

### Build

```bash
npm run build   # tsc → dist/
```

### Test

```bash
npm test            # run once (vitest)
npm run test:watch  # watch mode
```

Test coverage includes chunker (symbol detection, sliding window), embedder (truncation, normalization), file utilities (extension mapping, discovery), and hash functions (MD5, chunk IDs).

### Project Structure

```
src/
├── index.ts              # CLI entry point (commander.js)
├── config/
│   └── config.ts         # Config interface, defaults, env vars, persistent config
├── cli/
│   ├── commands.ts       # Command handlers (init, index, search, status, config)
│   ├── mascot.ts         # Squirrel ASCII art with gradient colors
│   └── ui.ts             # Spinners, progress formatting, result display
├── core/
│   ├── indexer.ts        # Central orchestrator
│   ├── chunker.ts        # Symbol-based + sliding window chunking
│   ├── embedder.ts       # Ollama embedding client
│   └── vectorstore.ts    # Qdrant CRUD operations
├── mcp/
│   └── server.ts         # MCP stdio server (5 tools)
├── watcher/
│   └── watcher.ts        # File change detection + auto-reindex
├── utils/
│   ├── files.ts          # File discovery, language detection
│   ├── hash.ts           # MD5, chunk IDs, index hashing
│   └── logger.ts         # stderr logging (warn, error)
└── __tests__/
    ├── chunker.test.ts
    ├── embedder.test.ts
    ├── files.test.ts
    └── hash.test.ts
```

## License

MIT
