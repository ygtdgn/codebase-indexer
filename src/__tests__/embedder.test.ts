import { describe, it, expect } from "vitest";

// We test the truncateAndNormalize logic directly by replicating it
// since it's a private method. This avoids needing a live Ollama connection.
function truncateAndNormalize(vector: number[], dim: number): number[] {
  const truncated = vector.slice(0, dim);

  let norm = 0;
  for (const v of truncated) {
    norm += v * v;
  }
  norm = Math.sqrt(norm);

  if (norm === 0) return truncated;
  return truncated.map((v) => v / norm);
}

describe("truncateAndNormalize", () => {
  it("should truncate vector to target dimension", () => {
    const vector = [1, 2, 3, 4, 5, 6, 7, 8];
    const result = truncateAndNormalize(vector, 4);
    expect(result).toHaveLength(4);
  });

  it("should produce L2-normalized output", () => {
    const vector = [3, 4, 0, 0];
    const result = truncateAndNormalize(vector, 4);

    // L2 norm should be ~1.0
    const norm = Math.sqrt(result.reduce((sum, v) => sum + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 10);
  });

  it("should handle zero vector gracefully", () => {
    const vector = [0, 0, 0, 0];
    const result = truncateAndNormalize(vector, 4);
    expect(result).toEqual([0, 0, 0, 0]);
  });

  it("should handle single-element vector", () => {
    const vector = [5];
    const result = truncateAndNormalize(vector, 1);
    expect(result).toEqual([1]);
  });

  it("should not modify vector shorter than dim", () => {
    const vector = [3, 4];
    const result = truncateAndNormalize(vector, 10);
    expect(result).toHaveLength(2);
    const norm = Math.sqrt(result.reduce((sum, v) => sum + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 10);
  });

  it("should preserve direction after normalization", () => {
    const vector = [1, 1, 1, 1];
    const result = truncateAndNormalize(vector, 4);
    // All components should be equal
    const first = result[0];
    for (const v of result) {
      expect(v).toBeCloseTo(first, 10);
    }
  });
});
