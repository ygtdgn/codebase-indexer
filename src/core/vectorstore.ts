import { QdrantClient } from "@qdrant/js-client-rest";
import type { Config } from "../config/config.js";
import type { Chunk } from "./chunker.js";
import { chunkId } from "../utils/hash.js";

export interface SearchResult {
  score: number;
  filePath: string;
  language: string;
  startLine: number;
  endLine: number;
  chunkType: string;
  symbolName?: string;
  content: string;
  fileHash?: string;
}

interface PointPayload {
  content: string;
  file_path: string;
  language: string;
  start_line: number;
  end_line: number;
  chunk_type: string;
  symbol_name?: string;
  file_hash?: string;
}

export class VectorStore {
  private client: QdrantClient;
  private collectionName: string;
  private dim: number;

  constructor(config: Config) {
    this.client = new QdrantClient({ url: config.qdrantUrl });
    this.collectionName = config.collectionName;
    this.dim = config.embeddingDim;
  }

  async ensureCollection(): Promise<void> {
    const collections = await this.client.getCollections();
    const exists = collections.collections.some(
      (c) => c.name === this.collectionName,
    );

    if (!exists) {
      await this.client.createCollection(this.collectionName, {
        vectors: {
          size: this.dim,
          distance: "Cosine",
        },
      });

      // Create payload indices for filtering
      await this.client.createPayloadIndex(this.collectionName, {
        field_name: "file_path",
        field_schema: "keyword",
      });
      await this.client.createPayloadIndex(this.collectionName, {
        field_name: "language",
        field_schema: "keyword",
      });
      await this.client.createPayloadIndex(this.collectionName, {
        field_name: "chunk_type",
        field_schema: "keyword",
      });
    }
  }

  async upsert(
    chunks: Chunk[],
    embeddings: number[][],
    fileHash?: string,
  ): Promise<void> {
    if (chunks.length === 0) return;

    const points = chunks.map((chunk, i) => ({
      id: chunkId(chunk.filePath, chunk.startLine, chunk.endLine),
      vector: embeddings[i],
      payload: {
        content: chunk.content,
        file_path: chunk.filePath,
        language: chunk.language,
        start_line: chunk.startLine,
        end_line: chunk.endLine,
        chunk_type: chunk.chunkType,
        symbol_name: chunk.symbolName,
        file_hash: fileHash,
      } satisfies PointPayload,
    }));

    // Batch upsert in groups of 100
    for (let i = 0; i < points.length; i += 100) {
      const batch = points.slice(i, i + 100);
      await this.client.upsert(this.collectionName, {
        points: batch,
      });
    }
  }

  async deleteByFilePath(filePath: string): Promise<void> {
    await this.client.delete(this.collectionName, {
      filter: {
        must: [
          {
            key: "file_path",
            match: { value: filePath },
          },
        ],
      },
    });
  }

  async search(
    queryVector: number[],
    topK: number = 10,
    filters?: {
      language?: string;
      filePathPrefix?: string;
    },
  ): Promise<SearchResult[]> {
    const must: Array<Record<string, unknown>> = [];

    if (filters?.language) {
      must.push({
        key: "language",
        match: { value: filters.language },
      });
    }

    // Qdrant keyword index doesn't support native prefix match,
    // so we fetch more results and filter client-side
    const hasPrefix = !!filters?.filePathPrefix;
    const fetchLimit = hasPrefix ? topK * 3 : topK;

    const results = await this.client.search(this.collectionName, {
      vector: queryVector,
      limit: fetchLimit,
      with_payload: true,
      filter: must.length > 0 ? { must } : undefined,
    });

    let mapped = results.map((r) => {
      const p = r.payload as unknown as PointPayload;
      return {
        score: r.score,
        filePath: p.file_path,
        language: p.language,
        startLine: p.start_line,
        endLine: p.end_line,
        chunkType: p.chunk_type,
        symbolName: p.symbol_name,
        content: p.content,
        fileHash: p.file_hash,
      };
    });

    if (hasPrefix) {
      mapped = mapped.filter((r) => r.filePath.startsWith(filters!.filePathPrefix!));
    }

    return mapped.slice(0, topK);
  }

  async getFileHash(filePath: string): Promise<string | undefined> {
    const results = await this.client.scroll(this.collectionName, {
      filter: {
        must: [{ key: "file_path", match: { value: filePath } }],
      },
      limit: 1,
      with_payload: true,
    });

    if (results.points.length === 0) return undefined;
    const payload = results.points[0].payload as unknown as PointPayload;
    return payload.file_hash ?? undefined;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.getCollections();
      return true;
    } catch {
      return false;
    }
  }

  async getStats(): Promise<{
    totalPoints: number;
    collections: string[];
  }> {
    const collections = await this.client.getCollections();
    let totalPoints = 0;

    for (const col of collections.collections) {
      if (col.name === this.collectionName) {
        const info = await this.client.getCollection(this.collectionName);
        totalPoints = info.points_count ?? 0;
      }
    }

    return {
      totalPoints,
      collections: collections.collections.map((c) => c.name),
    };
  }
}
