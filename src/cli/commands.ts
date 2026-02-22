import path from "node:path";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execSync } from "node:child_process";
import type { Config } from "../config/config.js";
import { Indexer } from "../core/indexer.js";
import { createSpinner, formatProgress, printSearchResult, printStatus } from "./ui.js";
import { startMcpServer } from "../mcp/server.js";
import chalk from "chalk";

export async function initCommand(config: Config): Promise<void> {
  const spinner = createSpinner("Setting up Qdrant...");
  spinner.start();

  try {
    // Create config directory
    const configDir = path.join(process.env.HOME ?? "~", ".codebase-indexer");
    await mkdir(configDir, { recursive: true });

    // Write docker-compose.yml
    const composePath = path.join(configDir, "docker-compose.yml");
    const composeContent = `services:
  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant_storage:/qdrant/storage
    restart: unless-stopped

volumes:
  qdrant_storage:
`;

    await writeFile(composePath, composeContent, "utf-8");
    spinner.text = "Starting Qdrant container...";

    // Start Qdrant
    execSync(`docker compose -f "${composePath}" up -d`, {
      stdio: "pipe",
    });

    spinner.text = "Waiting for Qdrant to be ready...";

    // Wait for Qdrant to be healthy
    let healthy = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`${config.qdrantUrl}/healthz`);
        if (res.ok) {
          healthy = true;
          break;
        }
      } catch {
        // Not ready yet
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (!healthy) {
      spinner.fail("Qdrant did not become healthy in time");
      return;
    }

    spinner.succeed("Qdrant is running");

    // Check Ollama
    const ollamaSpinner = createSpinner("Checking Ollama connection...");
    ollamaSpinner.start();

    try {
      const res = await fetch(`${config.ollamaUrl}/api/tags`);
      if (res.ok) {
        const data = (await res.json()) as { models: { name: string }[] };
        const models = data.models.map((m) => m.name);
        ollamaSpinner.succeed(
          `Ollama connected (${models.length} models available)`,
        );

        if (!models.some((m) => m.includes(config.model.split(":")[0]))) {
          console.log(
            chalk.yellow(
              `  Warning: Model "${config.model}" not found. Run: ollama pull ${config.model}`,
            ),
          );
        }
      } else {
        ollamaSpinner.fail("Ollama responded with error");
      }
    } catch {
      ollamaSpinner.fail(`Cannot connect to Ollama at ${config.ollamaUrl}`);
      console.log(
        chalk.dim("  Make sure Ollama is running: ollama serve"),
      );
    }

    console.log(chalk.green("\nSetup complete! You can now run:"));
    console.log(chalk.dim("  npx codebase-indexer index ./your-project"));
    console.log(chalk.dim("  npx codebase-indexer --dir ./your-project"));
  } catch (error) {
    spinner.fail(
      `Init failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function indexCommand(
  directory: string,
  config: Config,
  options: { setupClaude?: boolean } = {},
): Promise<void> {
  const absDir = path.resolve(directory);
  if (!existsSync(absDir)) {
    console.error(chalk.red(`Directory not found: ${absDir}`));
    process.exit(1);
  }

  const spinner = createSpinner("Initializing...");
  spinner.start();

  try {
    const indexer = new Indexer(config);
    await indexer.initialize();

    spinner.text = "Discovering files...";

    const progress = await indexer.indexDirectory(absDir, (p) => {
      spinner.text = formatProgress(p);
    });

    spinner.succeed(
      `Indexed ${progress.processedFiles} files (${progress.totalChunks} chunks, ${progress.skippedFiles} skipped)`,
    );

    if (options.setupClaude) {
      await writeClaude(absDir, config);
    }
  } catch (error) {
    spinner.fail(
      `Indexing failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

const CLAUDE_MD_SECTION_START = "<!-- codebase-indexer:start -->";
const CLAUDE_MD_SECTION_END = "<!-- codebase-indexer:end -->";

function generateClaudeMdSection(config: Config): string {
  return `${CLAUDE_MD_SECTION_START}
## Codebase Semantic Search (MCP: codebase-indexer)

This project has a semantic code search index powered by Ollama embeddings and Qdrant vector DB, exposed as an MCP server.

### When to use

- **Before exploring unfamiliar code**: Use \`search_code\` to find relevant files and functions instead of manually grepping. This is especially useful in large codebases.
- **When implementing a feature**: Search for existing patterns, similar implementations, or related utilities (e.g., \`search_code("authentication middleware")\`).
- **When fixing a bug**: Search for the error message, function name, or concept to quickly locate relevant code.
- **When refactoring**: Find all code related to a concept across the entire codebase semantically, not just by exact text match.

### Available tools

| Tool | Purpose | Example |
|------|---------|---------|
| \`search_code\` | Semantic search across the codebase | \`search_code({query: "database connection pooling", top_k: 5})\` |
| \`search_code\` with filters | Narrow results by language or path | \`search_code({query: "error handling", language: "typescript", file_path_prefix: "src/api/"})\` |
| \`index_file\` | Index/re-index a single file | \`index_file({path: "src/new-module.ts"})\` |
| \`index_directory\` | Re-index the full project (incremental) | \`index_directory({})\` |
| \`get_index_status\` | Check if services are healthy | \`get_index_status({})\` |
| \`delete_file\` | Remove a deleted file from the index | \`delete_file({path: "src/old-module.ts"})\` |

### Tips

- \`search_code\` uses natural language — describe what you're looking for conceptually, not just keywords.
- The index updates automatically when files change (file watcher is enabled).
- If search results seem stale, run \`index_directory\` to force a re-index.
- Use \`file_path_prefix\` filter to scope searches to specific directories.

### Configuration

- Ollama: \`${config.ollamaUrl}\`
- Qdrant: \`${config.qdrantUrl}\`
- Model: \`${config.model}\` (dim: ${config.embeddingDim})
- Collection: \`${config.collectionName}\`
${CLAUDE_MD_SECTION_END}`;
}

async function writeClaude(directory: string, config: Config): Promise<void> {
  const claudePath = path.join(directory, "CLAUDE.md");
  const newSection = generateClaudeMdSection(config);

  let content = "";
  try {
    content = await readFile(claudePath, "utf-8");
  } catch {
    // File doesn't exist yet
  }

  if (content.includes(CLAUDE_MD_SECTION_START)) {
    // Replace existing section
    const regex = new RegExp(
      `${escapeRegex(CLAUDE_MD_SECTION_START)}[\\s\\S]*?${escapeRegex(CLAUDE_MD_SECTION_END)}`,
    );
    content = content.replace(regex, newSection);
  } else {
    // Append to end
    content = content ? `${content.trimEnd()}\n\n${newSection}\n` : `${newSection}\n`;
  }

  await writeFile(claudePath, content, "utf-8");
  console.log(chalk.green(`  CLAUDE.md updated: ${claudePath}`));
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function searchCommand(
  query: string,
  topK: number,
  language: string | undefined,
  config: Config,
): Promise<void> {
  const spinner = createSpinner("Searching...");
  spinner.start();

  try {
    const indexer = new Indexer(config);
    await indexer.initialize();

    const results = await indexer.search(query, topK, { language });
    spinner.stop();

    if (results.length === 0) {
      console.log(chalk.yellow("No results found."));
      return;
    }

    console.log(chalk.bold(`\nFound ${results.length} results for: "${query}"\n`));

    for (let i = 0; i < results.length; i++) {
      printSearchResult(results[i], i);
    }
  } catch (error) {
    spinner.fail(
      `Search failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

export async function statusCommand(config: Config): Promise<void> {
  const spinner = createSpinner("Checking status...");
  spinner.start();

  try {
    const indexer = new Indexer(config);
    const [health, stats] = await Promise.all([
      indexer.healthCheck(),
      indexer.getStats().catch(() => ({ totalPoints: 0, collections: [] as string[] })),
    ]);

    spinner.stop();
    printStatus(health, stats, config);
  } catch (error) {
    spinner.fail(
      `Status check failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function mcpCommand(config: Config): Promise<void> {
  // In MCP mode, we don't want any console output on stdout (it's used for JSON-RPC)
  // Redirect informational messages to stderr
  const log = (msg: string) => process.stderr.write(msg + "\n");

  log(`Starting MCP server for directory: ${path.resolve(config.directory)}`);
  log(`Ollama: ${config.ollamaUrl} | Qdrant: ${config.qdrantUrl}`);
  log(`Model: ${config.model} | Dim: ${config.embeddingDim}`);
  if (config.watch) log("File watching: enabled");

  await startMcpServer(config);
}
