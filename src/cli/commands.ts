import path from "node:path";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execSync } from "node:child_process";
import { select, input, number } from "@inquirer/prompts";
import type { Config } from "../config/config.js";
import {
  loadSavedConfig,
  saveSavedConfig,
  deleteSavedConfig,
  type SavedConfig,
} from "../config/config.js";
import { Indexer } from "../core/indexer.js";
import { createSpinner, formatProgress, printSearchResult, printStatus } from "./ui.js";
import { printWelcome, printMascot } from "./mascot.js";
import { startMcpServer } from "../mcp/server.js";
import chalk from "chalk";

export async function initCommand(config: Config): Promise<void> {
  printWelcome();

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
              `  Model "${config.model}" not found. Pulling...`,
            ),
          );
          try {
            execSync(`ollama pull ${config.model}`, { stdio: "inherit" });
            console.log(chalk.green(`  Model "${config.model}" pulled successfully.`));
          } catch {
            console.log(
              chalk.red(
                `  Failed to pull model. Run manually: ollama pull ${config.model}`,
              ),
            );
          }
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
  options: { setupClaude?: boolean; setupCodex?: boolean; setupGlobally?: boolean; force?: boolean } = {},
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
    }, { force: options.force });

    spinner.succeed(
      `Indexed ${progress.processedFiles} files (${progress.totalChunks} chunks, ${progress.skippedFiles} skipped)`,
    );
    printMascot("success", "All done!");

    if (options.setupClaude) {
      await writeClaude(absDir, config, options.setupGlobally === true);
    }
    if (options.setupCodex) {
      await writeCodex(absDir, config, options.setupGlobally === true);
    }
  } catch (error) {
    spinner.fail(
      `Indexing failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    printMascot("error", "Something went wrong...");
    process.exit(1);
  }
}

const CLAUDE_MD_SECTION_START = "<!-- codebase-indexer:start -->";
const CLAUDE_MD_SECTION_END = "<!-- codebase-indexer:end -->";
const AGENTS_MD_SECTION_START = "<!-- codebase-indexer-codex:start -->";
const AGENTS_MD_SECTION_END = "<!-- codebase-indexer-codex:end -->";

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

function generateAgentsMdSection(config: Config): string {
  return `${AGENTS_MD_SECTION_START}
## Codebase Semantic Search (MCP: codebase-indexer)

This repository has semantic code search exposed through an MCP server.

### When to use in Codex

- Start with \`search_code\` before broad text grep when you need concept-level matches.
- Use \`search_code\` to find similar implementations before adding a new feature.
- Use \`index_file\` after major edits if you need immediate search freshness.
- Use \`index_directory\` when results look stale across multiple files.

### MCP tools

| Tool | Purpose | Example |
|------|---------|---------|
| \`search_code\` | Semantic search | \`search_code({query: "retry logic for API client", top_k: 5})\` |
| \`index_file\` | Re-index one file | \`index_file({path: "src/api/client.ts"})\` |
| \`index_directory\` | Re-index the project | \`index_directory({})\` |
| \`get_index_status\` | Health/status check | \`get_index_status({})\` |
| \`delete_file\` | Remove deleted file from index | \`delete_file({path: "src/old.ts"})\` |

### Configuration

- Ollama: \`${config.ollamaUrl}\`
- Qdrant: \`${config.qdrantUrl}\`
- Model: \`${config.model}\` (dim: ${config.embeddingDim})
- Collection: \`${config.collectionName}\`
${AGENTS_MD_SECTION_END}`;
}

async function writeClaude(directory: string, config: Config, globally: boolean): Promise<void> {
  const claudePath = path.join(directory, "CLAUDE.md");
  await upsertMarkdownSection(
    claudePath,
    generateClaudeMdSection(config),
    CLAUDE_MD_SECTION_START,
    CLAUDE_MD_SECTION_END,
  );
  console.log(chalk.green(`  CLAUDE.md updated: ${claudePath}`));

  if (globally) {
    await writeClaudeGlobalConfig(directory, config);
  } else {
    await writeMcpConfig(directory, config);
  }
}

async function writeCodex(directory: string, config: Config, globally: boolean): Promise<void> {
  const agentsPath = path.join(directory, "AGENTS.md");
  await upsertMarkdownSection(
    agentsPath,
    generateAgentsMdSection(config),
    AGENTS_MD_SECTION_START,
    AGENTS_MD_SECTION_END,
  );
  console.log(chalk.green(`  AGENTS.md updated: ${agentsPath}`));

  await writeCodexConfig(directory, config, globally);
}

async function upsertMarkdownSection(
  filePath: string,
  newSection: string,
  sectionStart: string,
  sectionEnd: string,
): Promise<void> {
  let content = "";
  try {
    content = await readFile(filePath, "utf-8");
  } catch {
    // File doesn't exist yet
  }

  if (content.includes(sectionStart)) {
    const regex = new RegExp(
      `${escapeRegex(sectionStart)}[\\s\\S]*?${escapeRegex(sectionEnd)}`,
    );
    content = content.replace(regex, newSection);
  } else {
    content = content ? `${content.trimEnd()}\n\n${newSection}\n` : `${newSection}\n`;
  }

  await writeFile(filePath, content, "utf-8");
}

interface McpConfig {
  mcpServers: Record<string, {
    command: string;
    args: string[];
    env?: Record<string, string>;
  }>;
}

interface ClaudeGlobalConfig {
  mcpServers?: Record<string, {
    type?: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

async function writeMcpConfig(directory: string, config: Config): Promise<void> {
  const mcpPath = path.join(directory, ".mcp.json");
  const args = buildMcpArgs(directory, config);

  // Read existing .mcp.json or start fresh
  let mcpConfig: McpConfig = { mcpServers: {} };
  try {
    const existing = await readFile(mcpPath, "utf-8");
    mcpConfig = JSON.parse(existing) as McpConfig;
    if (!mcpConfig.mcpServers) {
      mcpConfig.mcpServers = {};
    }
  } catch {
    // File doesn't exist or invalid JSON
  }

  // Add/update our server entry
  mcpConfig.mcpServers["codebase-indexer"] = {
    command: "npx",
    args,
  };

  await writeFile(mcpPath, JSON.stringify(mcpConfig, null, 2) + "\n", "utf-8");
  console.log(chalk.green(`  .mcp.json updated: ${mcpPath}`));
}

async function writeClaudeGlobalConfig(directory: string, config: Config): Promise<void> {
  const homeDir = getHomeDirectory();
  const claudeGlobalPath = path.join(homeDir, ".claude.json");
  const args = buildMcpArgs(directory, config);

  let claudeConfig: ClaudeGlobalConfig = {};
  try {
    const existing = await readFile(claudeGlobalPath, "utf-8");
    claudeConfig = JSON.parse(existing) as ClaudeGlobalConfig;
  } catch {
    // File doesn't exist or invalid JSON
  }

  if (!claudeConfig.mcpServers || typeof claudeConfig.mcpServers !== "object") {
    claudeConfig.mcpServers = {};
  }

  claudeConfig.mcpServers["codebase-indexer"] = {
    type: "stdio",
    command: "npx",
    args,
    env: {},
  };

  await writeFile(claudeGlobalPath, JSON.stringify(claudeConfig, null, 2) + "\n", "utf-8");
  console.log(chalk.green(`  Claude global MCP updated: ${claudeGlobalPath}`));
}

async function writeCodexConfig(directory: string, config: Config, globally: boolean): Promise<void> {
  const homeDir = getHomeDirectory();
  const configPath = globally
    ? path.join(homeDir, ".codex", "config.toml")
    : path.join(directory, ".codex", "config.toml");
  const absDir = path.resolve(directory);
  const args = buildMcpArgs(directory, config);

  await mkdir(path.dirname(configPath), { recursive: true });

  let content = "";
  try {
    content = await readFile(configPath, "utf-8");
  } catch {
    // File doesn't exist yet
  }

  const newSection = `[mcp_servers.codebase-indexer]
command = ${toTomlString("npx")}
args = ${toTomlArray(args)}
cwd = ${toTomlString(absDir)}
`;

  const updated = upsertTomlTable(content, "mcp_servers.codebase-indexer", newSection);
  await writeFile(configPath, updated, "utf-8");
  console.log(chalk.green(`  Codex MCP config updated: ${configPath}`));
}

function buildMcpArgs(directory: string, config: Config): string[] {
  const absDir = path.resolve(directory);
  const args = ["codebase-indexer", "--dir", absDir];

  // Only include non-default flags so the config stays clean
  if (config.ollamaUrl !== "http://localhost:11434") {
    args.push("--ollama-url", config.ollamaUrl);
  }
  if (config.qdrantUrl !== "http://localhost:6333") {
    args.push("--qdrant-url", config.qdrantUrl);
  }
  if (config.model !== "qwen3-embedding:0.6b") {
    args.push("--model", config.model);
  }
  if (config.embeddingDim !== 512) {
    args.push("--dim", String(config.embeddingDim));
  }
  if (config.collectionName !== "codebase") {
    args.push("--collection", config.collectionName);
  }

  return args;
}

function getHomeDirectory(): string {
  const homeDir = process.env.HOME ?? process.env.USERPROFILE;
  if (!homeDir) {
    throw new Error("Cannot determine home directory for global setup");
  }
  return homeDir;
}

function parseTomlTableHeader(line: string): string | null {
  const match = line.match(/^\s*\[([^\]]+)\]\s*$/);
  return match ? match[1].trim() : null;
}

function upsertTomlTable(content: string, tablePrefix: string, newSection: string): string {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const kept: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const tableName = parseTomlTableHeader(lines[i]);
    if (tableName === tablePrefix || tableName?.startsWith(`${tablePrefix}.`)) {
      i += 1;
      while (i < lines.length) {
        const nextTable = parseTomlTableHeader(lines[i]);
        if (nextTable) break;
        i += 1;
      }

      while (kept.length > 0 && kept[kept.length - 1].trim() === "") {
        kept.pop();
      }
      continue;
    }

    kept.push(lines[i]);
    i += 1;
  }

  while (kept.length > 0 && kept[kept.length - 1].trim() === "") {
    kept.pop();
  }

  const prefix = kept.length > 0 ? `${kept.join("\n").trimEnd()}\n\n` : "";
  return `${prefix}${newSection.trimEnd()}\n`;
}

function toTomlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function toTomlArray(values: string[]): string {
  return `[${values.map((value) => toTomlString(value)).join(", ")}]`;
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

const DEFAULTS: SavedConfig = {
  ollamaUrl: "http://localhost:11434",
  qdrantUrl: "http://localhost:6333",
  model: "qwen3-embedding:0.6b",
  embeddingDim: 512,
  collectionName: "codebase",
};

function printConfigTable(config: SavedConfig): void {
  const heading = (text: string) => chalk.hex("#d97706").bold(text);
  const val = (v: string | number | undefined, def: string | number) =>
    v !== undefined && v !== def
      ? chalk.green(String(v))
      : chalk.dim(String(def));

  console.log(heading("\n  Current Settings:"));
  console.log(`    Ollama URL:          ${val(config.ollamaUrl, DEFAULTS.ollamaUrl!)}`);
  console.log(`    Qdrant URL:          ${val(config.qdrantUrl, DEFAULTS.qdrantUrl!)}`);
  console.log(`    Embedding Model:     ${val(config.model, DEFAULTS.model!)}`);
  console.log(`    Embedding Dimension: ${val(config.embeddingDim, DEFAULTS.embeddingDim!)}`);
  console.log(`    Collection Name:     ${val(config.collectionName, DEFAULTS.collectionName!)}`);
  console.log();
}

type ConfigField = "ollamaUrl" | "qdrantUrl" | "model" | "embeddingDim" | "collectionName";

export async function configCommand(): Promise<void> {
  printMascot("welcome", "Settings");

  let saved = await loadSavedConfig();
  printConfigTable({ ...DEFAULTS, ...saved });

  const fieldLabels: Record<ConfigField, string> = {
    ollamaUrl: "Ollama URL",
    qdrantUrl: "Qdrant URL",
    model: "Embedding Model",
    embeddingDim: "Embedding Dimension",
    collectionName: "Collection Name",
  };

  let running = true;
  while (running) {
    const merged = { ...DEFAULTS, ...saved };

    const choice = await select({
      message: "Select a setting to edit:",
      choices: [
        { name: `Ollama URL          ${chalk.dim(`(${merged.ollamaUrl})`)}`, value: "ollamaUrl" as const },
        { name: `Qdrant URL          ${chalk.dim(`(${merged.qdrantUrl})`)}`, value: "qdrantUrl" as const },
        { name: `Embedding Model     ${chalk.dim(`(${merged.model})`)}`, value: "model" as const },
        { name: `Embedding Dimension ${chalk.dim(`(${merged.embeddingDim})`)}`, value: "embeddingDim" as const },
        { name: `Collection Name     ${chalk.dim(`(${merged.collectionName})`)}`, value: "collectionName" as const },
        { name: chalk.green("← Save & Exit"), value: "save" as const },
        { name: chalk.yellow("Reset to Defaults"), value: "reset" as const },
      ],
    });

    if (choice === "save") {
      await saveSavedConfig(saved);
      printMascot("success", "Settings saved!");
      running = false;
    } else if (choice === "reset") {
      await deleteSavedConfig();
      saved = {};
      console.log(chalk.yellow("\n  Config reset to defaults.\n"));
      printConfigTable(DEFAULTS);
    } else if (choice === "embeddingDim") {
      const value = await number({
        message: `${fieldLabels[choice]}:`,
        default: merged.embeddingDim,
      });
      if (value !== undefined) {
        saved.embeddingDim = value;
      }
    } else {
      const value = await input({
        message: `${fieldLabels[choice]}:`,
        default: merged[choice] as string,
      });
      if (value) {
        saved[choice] = value;
      }
    }
  }
}
