import type { Config } from "../config/config.js";

export interface EmbeddingResult {
  embeddings: number[][];
}

export class Embedder {
  private url: string;
  private model: string;
  private dim: number;

  constructor(config: Config) {
    this.url = config.ollamaUrl;
    this.model = config.model;
    this.dim = config.embeddingDim;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const response = await this.fetchWithRetry(texts);
    return response.map((vec) => this.truncateAndNormalize(vec));
  }

  async embedSingle(text: string): Promise<number[]> {
    const results = await this.embed([text]);
    return results[0];
  }

  private async fetchWithRetry(
    texts: string[],
    retries: number = 3,
  ): Promise<number[][]> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(`${this.url}/api/embed`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: this.model,
            input: texts,
          }),
        });

        if (!response.ok) {
          throw new Error(
            `Ollama API error: ${response.status} ${response.statusText}`,
          );
        }

        const data = (await response.json()) as EmbeddingResult;
        return data.embeddings;
      } catch (error) {
        if (attempt === retries) throw error;
        const delay = Math.pow(2, attempt) * 500;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw new Error("Unreachable");
  }

  // MRL truncation: cut to target dimension and L2-normalize
  private truncateAndNormalize(vector: number[]): number[] {
    const truncated = vector.slice(0, this.dim);

    let norm = 0;
    for (const v of truncated) {
      norm += v * v;
    }
    norm = Math.sqrt(norm);

    if (norm === 0) return truncated;
    return truncated.map((v) => v / norm);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.url}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async getModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.url}/api/tags`);
      if (!response.ok) return [];
      const data = (await response.json()) as { models: { name: string }[] };
      return data.models.map((m) => m.name);
    } catch {
      return [];
    }
  }
}
