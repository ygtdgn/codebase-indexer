import ora, { type Ora } from "ora";
import chalk from "chalk";
import type { IndexProgress } from "../core/indexer.js";

export function createSpinner(text: string): Ora {
  return ora({ text, spinner: "dots" });
}

export function formatProgress(progress: IndexProgress): string {
  const pct = progress.totalFiles > 0
    ? Math.round((progress.processedFiles / progress.totalFiles) * 100)
    : 0;
  const file = progress.currentFile ? ` | ${progress.currentFile}` : "";
  return `[${pct}%] ${progress.processedFiles}/${progress.totalFiles} files | ${progress.totalChunks} chunks | ${progress.skippedFiles} skipped${file}`;
}

export function printSearchResult(
  result: {
    score: number;
    filePath: string;
    language: string;
    startLine: number;
    endLine: number;
    chunkType: string;
    symbolName?: string;
    content: string;
  },
  index: number,
): void {
  const score = chalk.hex("#d97706")(`${result.score.toFixed(4)}`);
  const file = chalk.hex("#ea580c")(result.filePath);
  const lines = chalk.dim(`L${result.startLine}-L${result.endLine}`);
  const lang = chalk.hex("#b45309")(result.language);
  const symbol = result.symbolName ? chalk.hex("#16a34a")(` [${result.symbolName}]`) : "";

  console.log(`\n${chalk.bold(`#${index + 1}`)} ${score} ${file}:${lines} ${lang}${symbol}`);
  console.log(chalk.hex("#d97706")("\u2500".repeat(60)));

  // Show first 10 lines of content
  const contentLines = result.content.split("\n");
  const preview = contentLines.slice(0, 10).join("\n");
  console.log(preview);
  if (contentLines.length > 10) {
    console.log(chalk.dim(`  ... ${contentLines.length - 10} more lines`));
  }
}

export function printStatus(
  health: { ollama: boolean; qdrant: boolean; models: string[] },
  stats: { totalPoints: number; collections: string[] },
  config: { ollamaUrl: string; qdrantUrl: string; model: string; embeddingDim: number },
): void {
  const check = chalk.green("✓");
  const cross = chalk.red("✗");

  const heading = (text: string) => chalk.hex("#d97706").bold(text);

  console.log(heading("\nService Status:"));
  console.log(`  Ollama:  ${health.ollama ? check : cross} ${config.ollamaUrl}`);
  console.log(`  Qdrant:  ${health.qdrant ? check : cross} ${config.qdrantUrl}`);

  console.log(heading("\nConfiguration:"));
  console.log(`  Model:         ${config.model}`);
  console.log(`  Embedding Dim: ${config.embeddingDim}`);

  console.log(heading("\nIndex Stats:"));
  console.log(`  Total Chunks:  ${stats.totalPoints}`);
  console.log(`  Collections:   ${stats.collections.join(", ") || "none"}`);

  if (health.models.length > 0) {
    console.log(heading("\nAvailable Models:"));
    for (const model of health.models) {
      console.log(`  - ${model}`);
    }
  }
}
