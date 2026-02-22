import { createHash } from "node:crypto";
import type { Config } from "../config/config.js";

// Bump this when indexing logic changes (e.g. chunk format, context prefix)
const INDEX_VERSION = "2";

export function md5(content: string): string {
  return createHash("md5").update(content).digest("hex");
}

export function chunkId(filePath: string, startLine: number, endLine: number): string {
  return md5(`${filePath}:${startLine}:${endLine}`);
}

/**
 * Produces a combined hash of file content + indexing-relevant config.
 * When any indexing parameter changes, all files get re-indexed.
 */
export function fileIndexHash(content: string, config: Config): string {
  const configPart = `${INDEX_VERSION}:${config.model}:${config.embeddingDim}:${config.chunkSize}:${config.chunkOverlap}`;
  return md5(content + "\0" + configPart);
}
