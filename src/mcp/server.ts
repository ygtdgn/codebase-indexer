import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { Config } from "../config/config.js";
import { Indexer } from "../core/indexer.js";
import { FileWatcher } from "../watcher/watcher.js";
import { readFileContent } from "../utils/files.js";
import path from "node:path";

export async function startMcpServer(config: Config): Promise<void> {
  const indexer = new Indexer(config);
  await indexer.initialize();

  const server = new McpServer({
    name: "codebase-indexer",
    version: "1.0.0",
  });

  // Tool: search_code
  server.tool(
    "search_code",
    "Semantic code search across the indexed codebase. Returns the most relevant code chunks matching the query.",
    {
      query: z.string().describe("Natural language search query"),
      top_k: z.number().optional().default(10).describe("Number of results to return (default: 10)"),
      language: z.string().optional().describe("Filter by programming language (e.g., 'typescript', 'python')"),
      file_path_prefix: z.string().optional().describe("Filter by file path prefix (e.g., 'src/core/')"),
    },
    async ({ query, top_k, language, file_path_prefix }) => {
      try {
        const results = await indexer.search(query, top_k, {
          language,
          filePathPrefix: file_path_prefix,
        });

        if (results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No results found for the query.",
              },
            ],
          };
        }

        const formatted = results
          .map((r, i) => {
            const header = `## Result ${i + 1} (score: ${r.score.toFixed(4)})`;
            const meta = `**File:** ${r.filePath} (L${r.startLine}-L${r.endLine}) | **Language:** ${r.language} | **Type:** ${r.chunkType}${r.symbolName ? ` | **Symbol:** ${r.symbolName}` : ""}`;
            return `${header}\n${meta}\n\`\`\`${r.language}\n${r.content}\n\`\`\``;
          })
          .join("\n\n---\n\n");

        return {
          content: [{ type: "text" as const, text: formatted }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Search error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Tool: index_file
  server.tool(
    "index_file",
    "Index a single file into the vector store. Useful for ensuring a specific file is searchable.",
    {
      path: z.string().describe("Relative file path to index"),
      content: z.string().optional().describe("File content (if not provided, reads from disk)"),
    },
    async ({ path: filePath, content }) => {
      try {
        const fileContent = content ?? await readFileContent(path.resolve(config.directory, filePath));
        const numChunks = await indexer.indexFile(filePath, fileContent);
        return {
          content: [
            {
              type: "text" as const,
              text: numChunks > 0
                ? `Indexed ${filePath}: ${numChunks} chunks created.`
                : `${filePath} is already up-to-date.`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Index error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Tool: index_directory
  server.tool(
    "index_directory",
    "Index an entire directory into the vector store. Supports incremental indexing - unchanged files are skipped.",
    {
      directory: z.string().optional().describe("Directory to index (defaults to configured directory)"),
    },
    async ({ directory }) => {
      try {
        const dir = directory ?? config.directory;
        const progress = await indexer.indexDirectory(dir);
        return {
          content: [
            {
              type: "text" as const,
              text: `Indexing complete:\n- Files processed: ${progress.processedFiles}/${progress.totalFiles}\n- Chunks created: ${progress.totalChunks}\n- Files skipped (unchanged): ${progress.skippedFiles}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Index error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Tool: get_index_status
  server.tool(
    "get_index_status",
    "Check the health status of Ollama and Qdrant services, and get index statistics.",
    {},
    async () => {
      try {
        const [health, stats] = await Promise.all([
          indexer.healthCheck(),
          indexer.getStats(),
        ]);

        const lines = [
          `**Ollama:** ${health.ollama ? "Connected" : "Disconnected"} (${config.ollamaUrl})`,
          `**Qdrant:** ${health.qdrant ? "Connected" : "Disconnected"} (${config.qdrantUrl})`,
          `**Model:** ${config.model}`,
          `**Embedding Dim:** ${config.embeddingDim}`,
          `**Total Chunks:** ${stats.totalPoints}`,
          `**Collections:** ${stats.collections.join(", ") || "none"}`,
          `**Available Models:** ${health.models.join(", ") || "none"}`,
        ];

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Status error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Tool: delete_file
  server.tool(
    "delete_file",
    "Remove a file's chunks from the vector index.",
    {
      path: z.string().describe("Relative file path to remove from index"),
    },
    async ({ path: filePath }) => {
      try {
        await indexer.deleteFile(filePath);
        return {
          content: [
            {
              type: "text" as const,
              text: `Removed ${filePath} from index.`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Delete error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Start file watcher if configured
  let watcher: FileWatcher | null = null;
  if (config.watch) {
    watcher = new FileWatcher(config, indexer);
    await watcher.start(config.directory);
  }

  // Connect transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Handle graceful shutdown
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (watcher) await watcher.stop();
    // Brief wait for active Qdrant writes to complete
    await new Promise((r) => setTimeout(r, 1000));
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
