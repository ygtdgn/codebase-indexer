#!/usr/bin/env node

import { Command } from "commander";
import { resolveConfig } from "./config/config.js";
import {
  initCommand,
  indexCommand,
  searchCommand,
  statusCommand,
  mcpCommand,
} from "./cli/commands.js";

const program = new Command();

program
  .name("codebase-indexer")
  .description(
    "Semantic codebase indexer with Ollama + Qdrant, MCP server for Claude Code",
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
  .option("--setup-claude", "Write MCP usage instructions to CLAUDE.md in the project")
  .action(async (directory: string | undefined, cmdOpts: { setupClaude?: boolean }) => {
    const opts = program.opts();
    const dir = directory ?? opts.dir ?? ".";
    const config = resolveConfig({
      ollamaUrl: opts.ollamaUrl,
      qdrantUrl: opts.qdrantUrl,
      model: opts.model,
      embeddingDim: parseInt(opts.dim, 10),
      collectionName: opts.collection,
      directory: dir,
    });
    await indexCommand(dir, config, { setupClaude: cmdOpts.setupClaude });
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

program.parse();
