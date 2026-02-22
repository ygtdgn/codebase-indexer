export function warn(msg: string): void {
  process.stderr.write(`[codebase-indexer] WARN: ${msg}\n`);
}

export function error(msg: string): void {
  process.stderr.write(`[codebase-indexer] ERROR: ${msg}\n`);
}
