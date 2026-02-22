import { describe, it, expect } from "vitest";
import { chunkFile } from "../core/chunker.js";

describe("chunkFile", () => {
  it("should produce symbol chunks for TypeScript with functions", () => {
    const code = `export function hello() {
  return "world";
}

export function goodbye() {
  return "farewell";
}
`;
    const chunks = chunkFile(code, "example.ts");
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.every((c) => c.chunkType === "symbol")).toBe(true);
    expect(chunks.some((c) => c.symbolName === "hello")).toBe(true);
    expect(chunks.some((c) => c.symbolName === "goodbye")).toBe(true);
  });

  it("should produce symbol chunks for Python", () => {
    const code = `def greet(name):
    return f"Hello {name}"

class User:
    def __init__(self, name):
        self.name = name
`;
    const chunks = chunkFile(code, "example.py");
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.some((c) => c.symbolName === "greet")).toBe(true);
    expect(chunks.some((c) => c.symbolName === "User")).toBe(true);
  });

  it("should produce symbol chunks for Go", () => {
    const code = `func HandleRequest(w http.ResponseWriter, r *http.Request) {
    w.Write([]byte("ok"))
}

type Server struct {
    Port int
}
`;
    const chunks = chunkFile(code, "main.go");
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.some((c) => c.symbolName === "HandleRequest")).toBe(true);
    expect(chunks.some((c) => c.symbolName === "Server")).toBe(true);
  });

  it("should produce symbol chunks for Rust", () => {
    const code = `pub fn process(data: &[u8]) -> Result<()> {
    Ok(())
}

pub struct Config {
    pub name: String,
}
`;
    const chunks = chunkFile(code, "lib.rs");
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.some((c) => c.symbolName === "process")).toBe(true);
    expect(chunks.some((c) => c.symbolName === "Config")).toBe(true);
  });

  it("should fall back to sliding window for unsupported languages", () => {
    const code = "line 1\nline 2\nline 3\nline 4\n";
    const chunks = chunkFile(code, "data.txt");
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks.every((c) => c.chunkType === "window")).toBe(true);
  });

  it("should fall back to sliding window when symbol coverage < 50%", () => {
    // Lots of plain text with one small function
    const lines = Array.from({ length: 100 }, (_, i) => `// comment line ${i}`);
    lines.push("export function tiny() {}");
    const code = lines.join("\n");
    const chunks = chunkFile(code, "example.ts");
    expect(chunks.every((c) => c.chunkType === "window")).toBe(true);
  });

  it("should use sliding window for large files", () => {
    const code = "x".repeat(5000);
    const chunks = chunkFile(code, "big.txt", 1500, 200);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.chunkType === "window")).toBe(true);
  });

  it("should prefix chunks with file path context", () => {
    const code = "const x = 1;\n";
    const chunks = chunkFile(code, "src/utils/helper.ts");
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].content).toContain("// File: src/utils/helper.ts");
  });

  it("should set correct language from file extension", () => {
    const code = "fn main() {}\n";
    const chunks = chunkFile(code, "main.rs");
    expect(chunks[0].language).toBe("rust");
  });
});
