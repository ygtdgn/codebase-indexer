<!-- codebase-indexer-codex:start -->
## Codebase Semantic Search (MCP: codebase-indexer)

This repository has semantic code search exposed through an MCP server.

### When to use in Codex

- Start with `search_code` before broad text grep when you need concept-level matches.
- Use `search_code` to find similar implementations before adding a new feature.
- Use `index_file` after major edits if you need immediate search freshness.
- Use `index_directory` when results look stale across multiple files.

### MCP tools

| Tool | Purpose | Example |
|------|---------|---------|
| `search_code` | Semantic search | `search_code({query: "retry logic for API client", top_k: 5})` |
| `index_file` | Re-index one file | `index_file({path: "src/api/client.ts"})` |
| `index_directory` | Re-index the project | `index_directory({})` |
| `get_index_status` | Health/status check | `get_index_status({})` |
| `delete_file` | Remove deleted file from index | `delete_file({path: "src/old.ts"})` |

### Configuration

- Ollama: `http://localhost:11434`
- Qdrant: `http://localhost:6333`
- Model: `qwen3-embedding:0.6b` (dim: 512)
- Collection: `codebase`
<!-- codebase-indexer-codex:end -->
