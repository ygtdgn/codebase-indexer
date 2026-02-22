#!/usr/bin/env node

import { checkbox } from "@inquirer/prompts";
import { Command } from "commander";
import { resolveConfig, loadSavedConfig } from "./config/config.js";
import {
  initCommand,
  indexCommand,
  searchCommand,
  statusCommand,
  mcpCommand,
  configCommand,
} from "./cli/commands.js";

type SetupTarget = "claude" | "codex";

interface IndexCommandOptions {
  setup?: boolean;
  setupClaude?: boolean;
  setupCodex?: boolean;
  setupGlobally?: boolean;
  force?: boolean;
}

function parseOptionalInt(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

const program = new Command();

program
  .name("codebase-indexer")
  .description(
    "Semantic codebase indexer with Ollama + Qdrant, MCP server for Claude Code and Codex",
  )
  .version("1.0.0")
  .option("--ollama-url <url>", "Ollama API URL")
  .option("--qdrant-url <url>", "Qdrant API URL")
  .option("--model <name>", "Embedding model name")
  .option("--dim <number>", "Embedding dimension")
  .option("--dir <path>", "Directory to index/watch")
  .option("--collection <name>", "Qdrant collection name")
  .option("--no-watch", "Disable file watching in MCP mode");

// Init command
program
  .command("init")
  .description("Set up Qdrant (Docker) and check Ollama connection")
  .action(async () => {
    const opts = program.opts();
    const saved = await loadSavedConfig();
    const config = resolveConfig({
      ollamaUrl: opts.ollamaUrl,
      qdrantUrl: opts.qdrantUrl,
      model: opts.model,
      embeddingDim: parseOptionalInt(opts.dim),
      collectionName: opts.collection,
    }, saved);
    await initCommand(config);
  });

// Index command
program
  .command("index [directory]")
  .description("Index a directory")
  .option("--setup", "Interactively choose setup targets (Claude/Codex)")
  .option("--setup-claude", "Write MCP usage instructions to CLAUDE.md in the project")
  .option("--setup-codex", "Write MCP usage instructions to AGENTS.md and configure Codex MCP")
  .option(
    "--setup-globally",
    "Write MCP config to user-level config files instead of project-local files",
  )
  .option("--force", "Force re-index all files, ignoring cached hashes")
  .action(async (directory: string | undefined, cmdOpts: IndexCommandOptions) => {
    const opts = program.opts();
    const dir = directory ?? opts.dir ?? ".";
    const targets = await resolveSetupTargets(cmdOpts);
    const saved = await loadSavedConfig();
    const config = resolveConfig({
      ollamaUrl: opts.ollamaUrl,
      qdrantUrl: opts.qdrantUrl,
      model: opts.model,
      embeddingDim: parseOptionalInt(opts.dim),
      collectionName: opts.collection,
      directory: dir,
    }, saved);
    await indexCommand(dir, config, {
      setupClaude: targets.includes("claude"),
      setupCodex: targets.includes("codex"),
      setupGlobally: cmdOpts.setupGlobally === true,
      force: cmdOpts.force === true,
    });
  });

// Search command
program
  .command("search <query>")
  .description("Search the index")
  .option("-k, --top-k <number>", "Number of results", "10")
  .option("-l, --language <lang>", "Filter by language")
  .action(async (query: string, cmdOpts: { topK: string; language?: string }) => {
    const opts = program.opts();
    const saved = await loadSavedConfig();
    const config = resolveConfig({
      ollamaUrl: opts.ollamaUrl,
      qdrantUrl: opts.qdrantUrl,
      model: opts.model,
      embeddingDim: parseOptionalInt(opts.dim),
      collectionName: opts.collection,
    }, saved);
    await searchCommand(query, parseInt(cmdOpts.topK, 10), cmdOpts.language, config);
  });

// Status command
program
  .command("status")
  .description("Check Ollama and Qdrant status")
  .action(async () => {
    const opts = program.opts();
    const saved = await loadSavedConfig();
    const config = resolveConfig({
      ollamaUrl: opts.ollamaUrl,
      qdrantUrl: opts.qdrantUrl,
      model: opts.model,
      embeddingDim: parseOptionalInt(opts.dim),
      collectionName: opts.collection,
    }, saved);
    await statusCommand(config);
  });

// Config command
program
  .command("config")
  .description("Interactively edit connection and indexing settings")
  .action(async () => {
    await configCommand();
  });

// Default action: MCP server mode
program.action(async () => {
  const opts = program.opts();
  const dir = opts.dir ?? ".";
  const saved = await loadSavedConfig();
  const config = resolveConfig({
    ollamaUrl: opts.ollamaUrl,
    qdrantUrl: opts.qdrantUrl,
    model: opts.model,
    embeddingDim: parseOptionalInt(opts.dim),
    watch: opts.watch !== false,
    directory: dir,
    collectionName: opts.collection,
  }, saved);
  await mcpCommand(config);
});

async function resolveSetupTargets(options: IndexCommandOptions): Promise<SetupTarget[]> {
  const selected = new Set<SetupTarget>();

  if (options.setup === true) {
    for (const target of await promptSetupTargets()) {
      selected.add(target);
    }
  }

  if (options.setupClaude) {
    selected.add("claude");
  }
  if (options.setupCodex) {
    selected.add("codex");
  }

  // If the user asks for global setup without explicitly selecting targets,
  // default to setting up both integrations.
  if (options.setupGlobally && selected.size === 0) {
    selected.add("claude");
    selected.add("codex");
  }

  return Array.from(selected);
}

async function promptSetupTargets(): Promise<SetupTarget[]> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log("Interactive setup requires a TTY; defaulting to Claude + Codex.");
    return ["claude", "codex"];
  }

  const answers = await checkbox<SetupTarget>({
    message: "Select setup targets:",
    choices: [
      { name: "Claude  — CLAUDE.md + .mcp.json", value: "claude" as const, checked: true },
      { name: "Codex   — AGENTS.md + .codex/config.toml", value: "codex" as const, checked: true },
    ],
  });

  if (answers.length === 0) {
    return ["claude", "codex"];
  }
  return answers;
}

program.parse();
