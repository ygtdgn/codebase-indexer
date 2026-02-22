import path from "node:path";
import { watch, type FSWatcher } from "chokidar";
import type { Config } from "../config/config.js";
import type { Indexer } from "../core/indexer.js";
import { readFileContent, getLanguageFromExtension } from "../utils/files.js";
import { loadGitignore } from "../utils/files.js";
import type { Ignore } from "ignore";

export class FileWatcher {
  private watcher: FSWatcher | null = null;
  private config: Config;
  private indexer: Indexer;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingChanges: Map<string, "change" | "unlink"> = new Map();
  private processing = false;
  private ig: Ignore | null = null;

  constructor(config: Config, indexer: Indexer) {
    this.config = config;
    this.indexer = indexer;
  }

  async start(directory: string): Promise<void> {
    const absDir = path.resolve(directory);
    this.ig = await loadGitignore(absDir);

    // Add configured ignore dirs
    for (const dir of this.config.ignoreDirs) {
      this.ig.add(dir);
    }

    const extensionSet = new Set(this.config.codeExtensions);

    this.watcher = watch(absDir, {
      ignored: (filePath: string) => {
        const rel = path.relative(absDir, filePath);
        if (!rel || rel === ".") return false;

        // Check gitignore
        if (this.ig?.ignores(rel)) return true;

        return false;
      },
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    });

    this.watcher.on("add", (filePath) => this.onFileEvent(absDir, filePath, extensionSet, "change"));
    this.watcher.on("change", (filePath) => this.onFileEvent(absDir, filePath, extensionSet, "change"));
    this.watcher.on("unlink", (filePath) => this.onFileEvent(absDir, filePath, extensionSet, "unlink"));
  }

  private onFileEvent(
    baseDir: string,
    absPath: string,
    extensionSet: Set<string>,
    event: "change" | "unlink",
  ): void {
    const ext = path.extname(absPath).toLowerCase();
    if (!extensionSet.has(ext)) return;

    const relPath = path.relative(baseDir, absPath);
    this.pendingChanges.set(relPath, event);
    this.scheduleBatch();
  }

  private scheduleBatch(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.processBatch();
    }, 500);
  }

  private async processBatch(): Promise<void> {
    if (this.processing || this.pendingChanges.size === 0) return;

    this.processing = true;
    const changes = new Map(this.pendingChanges);
    this.pendingChanges.clear();

    try {
      for (const [relPath, event] of changes) {
        if (event === "unlink") {
          await this.indexer.deleteFile(relPath);
        } else {
          const absPath = path.resolve(this.config.directory, relPath);
          try {
            const content = await readFileContent(absPath);
            await this.indexer.indexFile(relPath, content);
          } catch {
            // File may have been deleted between event and processing
          }
        }
      }
    } finally {
      this.processing = false;
      // Process any changes that accumulated while we were processing
      if (this.pendingChanges.size > 0) {
        this.scheduleBatch();
      }
    }
  }

  async stop(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }
}
