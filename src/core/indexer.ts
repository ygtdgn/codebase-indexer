import path from "node:path";
import pLimit from "p-limit";
import type { Config } from "../config/config.js";
import { chunkFile, type Chunk } from "./chunker.js";
import { Embedder } from "./embedder.js";
import { VectorStore } from "./vectorstore.js";
import { discoverFiles, readFileContent } from "../utils/files.js";
import { fileIndexHash } from "../utils/hash.js";
import { warn } from "../utils/logger.js";

export interface IndexProgress {
  totalFiles: number;
  processedFiles: number;
  totalChunks: number;
  skippedFiles: number;
  currentFile?: string;
}

export type ProgressCallback = (progress: IndexProgress) => void;

export class Indexer {
  private embedder: Embedder;
  private vectorStore: VectorStore;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    this.embedder = new Embedder(config);
    this.vectorStore = new VectorStore(config);
  }

  async initialize(): Promise<void> {
    await this.vectorStore.ensureCollection();
  }

  async indexDirectory(
    directory: string,
    onProgress?: ProgressCallback,
    options?: { force?: boolean },
  ): Promise<IndexProgress> {
    const absDir = path.resolve(directory);
    const files = await discoverFiles(absDir, this.config);

    const progress: IndexProgress = {
      totalFiles: files.length,
      processedFiles: 0,
      totalChunks: 0,
      skippedFiles: 0,
    };

    onProgress?.(progress);

    const limit = pLimit(this.config.concurrency);

    const tasks = files.map((relFile) =>
      limit(async () => {
        const absPath = path.join(absDir, relFile);
        progress.currentFile = relFile;

        try {
          const content = await readFileContent(absPath);
          const contentHash = fileIndexHash(content, this.config);

          // Check if file is already indexed with same hash
          if (!options?.force) {
            const existingHash = await this.vectorStore.getFileHash(relFile);
            if (existingHash === contentHash) {
              progress.skippedFiles++;
              progress.processedFiles++;
              onProgress?.(progress);
              return;
            }
          }

          // Delete old chunks for this file
          await this.vectorStore.deleteByFilePath(relFile);

          // Chunk the file
          const chunks = chunkFile(
            content,
            relFile,
            this.config.chunkSize,
            this.config.chunkOverlap,
          );

          if (chunks.length === 0) {
            progress.processedFiles++;
            onProgress?.(progress);
            return;
          }

          // Batch embed
          await this.embedAndStore(chunks, contentHash);

          progress.totalChunks += chunks.length;
          progress.processedFiles++;
          onProgress?.(progress);
        } catch (err) {
          warn(`Failed to index ${relFile}: ${err instanceof Error ? err.message : String(err)}`);
          progress.processedFiles++;
          onProgress?.(progress);
        }
      }),
    );

    await Promise.all(tasks);
    return progress;
  }

  async indexFile(filePath: string, content: string): Promise<number> {
    const contentHash = fileIndexHash(content, this.config);

    // Check if already indexed
    const existingHash = await this.vectorStore.getFileHash(filePath);
    if (existingHash === contentHash) return 0;

    // Delete old chunks
    await this.vectorStore.deleteByFilePath(filePath);

    // Chunk
    const chunks = chunkFile(
      content,
      filePath,
      this.config.chunkSize,
      this.config.chunkOverlap,
    );

    if (chunks.length === 0) return 0;

    // Embed and store
    await this.embedAndStore(chunks, contentHash);
    return chunks.length;
  }

  async deleteFile(filePath: string): Promise<void> {
    await this.vectorStore.deleteByFilePath(filePath);
  }

  async search(
    query: string,
    topK: number = 10,
    filters?: { language?: string; filePathPrefix?: string },
  ) {
    const queryVector = await this.embedder.embedSingle(query);
    return this.vectorStore.search(queryVector, topK, filters);
  }

  private async embedAndStore(
    chunks: Chunk[],
    fileHash: string,
  ): Promise<void> {
    const batches: Chunk[][] = [];
    for (let i = 0; i < chunks.length; i += this.config.batchSize) {
      batches.push(chunks.slice(i, i + this.config.batchSize));
    }

    const limit = pLimit(2); // Max 2 parallel batch embeddings per file
    await Promise.all(
      batches.map((batch) =>
        limit(async () => {
          const texts = batch.map((c) => c.content);
          const embeddings = await this.embedder.embed(texts);
          await this.vectorStore.upsert(batch, embeddings, fileHash);
        }),
      ),
    );
  }

  async healthCheck(): Promise<{
    ollama: boolean;
    qdrant: boolean;
    models: string[];
  }> {
    const [ollama, qdrant, models] = await Promise.all([
      this.embedder.healthCheck(),
      this.vectorStore.healthCheck(),
      this.embedder.getModels(),
    ]);
    return { ollama, qdrant, models };
  }

  async getStats() {
    return this.vectorStore.getStats();
  }
}
