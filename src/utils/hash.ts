import { createHash } from "node:crypto";

export function md5(content: string): string {
  return createHash("md5").update(content).digest("hex");
}

export function chunkId(filePath: string, startLine: number, endLine: number): string {
  return md5(`${filePath}:${startLine}:${endLine}`);
}
