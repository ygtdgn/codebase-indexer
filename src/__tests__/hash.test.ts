import { describe, it, expect } from "vitest";
import { md5, chunkId, fileIndexHash } from "../utils/hash.js";
import { resolveConfig } from "../config/config.js";

describe("md5", () => {
  it("should produce consistent hash for same input", () => {
    const hash1 = md5("hello world");
    const hash2 = md5("hello world");
    expect(hash1).toBe(hash2);
  });

  it("should produce different hashes for different inputs", () => {
    const hash1 = md5("hello");
    const hash2 = md5("world");
    expect(hash1).not.toBe(hash2);
  });

  it("should produce 32-character hex string", () => {
    const hash = md5("test");
    expect(hash).toMatch(/^[a-f0-9]{32}$/);
  });

  it("should handle empty string", () => {
    const hash = md5("");
    expect(hash).toMatch(/^[a-f0-9]{32}$/);
  });
});

describe("chunkId", () => {
  it("should be deterministic", () => {
    const id1 = chunkId("src/foo.ts", 1, 10);
    const id2 = chunkId("src/foo.ts", 1, 10);
    expect(id1).toBe(id2);
  });

  it("should differ for different file paths", () => {
    const id1 = chunkId("src/foo.ts", 1, 10);
    const id2 = chunkId("src/bar.ts", 1, 10);
    expect(id1).not.toBe(id2);
  });

  it("should differ for different line ranges", () => {
    const id1 = chunkId("src/foo.ts", 1, 10);
    const id2 = chunkId("src/foo.ts", 1, 20);
    expect(id1).not.toBe(id2);
  });

  it("should produce 32-character hex string", () => {
    const id = chunkId("file.ts", 1, 5);
    expect(id).toMatch(/^[a-f0-9]{32}$/);
  });
});

describe("fileIndexHash", () => {
  it("should be deterministic for same content and config", () => {
    const config = resolveConfig();
    const hash1 = fileIndexHash("hello", config);
    const hash2 = fileIndexHash("hello", config);
    expect(hash1).toBe(hash2);
  });

  it("should differ when content changes", () => {
    const config = resolveConfig();
    const hash1 = fileIndexHash("hello", config);
    const hash2 = fileIndexHash("world", config);
    expect(hash1).not.toBe(hash2);
  });

  it("should differ when model changes", () => {
    const config1 = resolveConfig({ model: "model-a" });
    const config2 = resolveConfig({ model: "model-b" });
    const hash1 = fileIndexHash("hello", config1);
    const hash2 = fileIndexHash("hello", config2);
    expect(hash1).not.toBe(hash2);
  });

  it("should differ when embeddingDim changes", () => {
    const config1 = resolveConfig({ embeddingDim: 512 });
    const config2 = resolveConfig({ embeddingDim: 1024 });
    const hash1 = fileIndexHash("hello", config1);
    const hash2 = fileIndexHash("hello", config2);
    expect(hash1).not.toBe(hash2);
  });

  it("should differ when chunkSize changes", () => {
    const config1 = resolveConfig({ chunkSize: 1500 });
    const config2 = resolveConfig({ chunkSize: 2000 });
    const hash1 = fileIndexHash("hello", config1);
    const hash2 = fileIndexHash("hello", config2);
    expect(hash1).not.toBe(hash2);
  });
});
