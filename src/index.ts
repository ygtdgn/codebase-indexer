#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { Command } from "commander";
import { resolveConfig } from "./config/config.js";
import {
  initCommand,
  indexCommand,
  searchCommand,
  statusCommand,
  mcpCommand,
} from "./cli/commands.js";

type SetupTarget = "claude" | "codex";

interface IndexCommandOptions {
  setup?: boolean;
  setupClaude?: boolean;
  setupCodex?: boolean;
  setupGlobally?: boolean;
}

const program = new Command();

program
  .name("codebase-indexer")
  .description(
    "Semantic codebase indexer with Ollama + Qdrant, MCP server for Claude Code and Codex",
  )
  .version("1.0.0")
  .option("--ollama-url <url>", "Ollama API URL", "http://localhost:11434")
  .option("--qdrant-url <url>", "Qdrant API URL", "http://localhost:6333")
  .option("--model <name>", "Embedding model name", "qwen3-embedding:0.6b")
  .option("--dim <number>", "Embedding dimension", "512")
  .option("--dir <path>", "Directory to index/watch")
  .option("--collection <name>", "Qdrant collection name", "codebase")
  .option("--no-watch", "Disable file watching in MCP mode");

// Init command
program
  .command("init")
  .description("Set up Qdrant (Docker) and check Ollama connection")
  .action(async () => {
    const opts = program.opts();
    const config = resolveConfig({
      ollamaUrl: opts.ollamaUrl,
      qdrantUrl: opts.qdrantUrl,
      model: opts.model,
      embeddingDim: parseInt(opts.dim, 10),
      collectionName: opts.collection,
    });
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
  .action(async (directory: string | undefined, cmdOpts: IndexCommandOptions) => {
    const opts = program.opts();
    const dir = directory ?? opts.dir ?? ".";
    const targets = await resolveSetupTargets(cmdOpts);
    const config = resolveConfig({
      ollamaUrl: opts.ollamaUrl,
      qdrantUrl: opts.qdrantUrl,
      model: opts.model,
      embeddingDim: parseInt(opts.dim, 10),
      collectionName: opts.collection,
      directory: dir,
    });
    await indexCommand(dir, config, {
      setupClaude: targets.includes("claude"),
      setupCodex: targets.includes("codex"),
      setupGlobally: cmdOpts.setupGlobally === true,
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
    const config = resolveConfig({
      ollamaUrl: opts.ollamaUrl,
      qdrantUrl: opts.qdrantUrl,
      model: opts.model,
      embeddingDim: parseInt(opts.dim, 10),
      collectionName: opts.collection,
    });
    await searchCommand(query, parseInt(cmdOpts.topK, 10), cmdOpts.language, config);
  });

// Status command
program
  .command("status")
  .description("Check Ollama and Qdrant status")
  .action(async () => {
    const opts = program.opts();
    const config = resolveConfig({
      ollamaUrl: opts.ollamaUrl,
      qdrantUrl: opts.qdrantUrl,
      model: opts.model,
      embeddingDim: parseInt(opts.dim, 10),
      collectionName: opts.collection,
    });
    await statusCommand(config);
  });

// Default action: MCP server mode
program.action(async () => {
  const opts = program.opts();
  const dir = opts.dir ?? ".";
  const config = resolveConfig({
    ollamaUrl: opts.ollamaUrl,
    qdrantUrl: opts.qdrantUrl,
    model: opts.model,
    embeddingDim: parseInt(opts.dim, 10),
    watch: opts.watch !== false,
    directory: dir,
    collectionName: opts.collection,
  });
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

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log("\nSetup targets:");
    console.log("  1) Claude");
    console.log("  2) Codex");
    console.log("  3) Claude + Codex");

    const answer = (await rl.question("Select target(s) [3]: ")).trim();
    const normalized = answer === "" ? "3" : answer.toLowerCase();

    if (normalized === "1" || normalized === "claude") {
      return ["claude"];
    }
    if (normalized === "2" || normalized === "codex") {
      return ["codex"];
    }
    if (
      normalized === "3"
      || normalized === "both"
      || normalized === "all"
      || normalized === "claude,codex"
      || normalized === "codex,claude"
    ) {
      return ["claude", "codex"];
    }

    const parts = normalized.split(",").map((part) => part.trim()).filter(Boolean);
    const selected = new Set<SetupTarget>();
    for (const part of parts) {
      if (part === "1" || part === "claude") selected.add("claude");
      if (part === "2" || part === "codex") selected.add("codex");
    }

    if (selected.size === 0) {
      console.log("Invalid selection; defaulting to Claude + Codex.");
      return ["claude", "codex"];
    }

    return Array.from(selected);
  } finally {
    rl.close();
  }
}

program.parse();
