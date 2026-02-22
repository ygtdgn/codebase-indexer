import { getLanguageFromExtension } from "../utils/files.js";

export interface Chunk {
  content: string;
  filePath: string;
  language: string;
  startLine: number;
  endLine: number;
  chunkType: "symbol" | "window";
  symbolName?: string;
}

interface SymbolPattern {
  regex: RegExp;
  nameGroup: number;
}

// Language-specific symbol patterns for splitting code into meaningful chunks
const SYMBOL_PATTERNS: Record<string, SymbolPattern[]> = {
  typescript: [
    { regex: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/m, nameGroup: 1 },
    { regex: /^(?:export\s+)?class\s+(\w+)/m, nameGroup: 1 },
    { regex: /^(?:export\s+)?interface\s+(\w+)/m, nameGroup: 1 },
    { regex: /^(?:export\s+)?type\s+(\w+)/m, nameGroup: 1 },
    { regex: /^(?:export\s+)?enum\s+(\w+)/m, nameGroup: 1 },
    { regex: /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(/m, nameGroup: 1 },
  ],
  javascript: [
    { regex: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/m, nameGroup: 1 },
    { regex: /^(?:export\s+)?class\s+(\w+)/m, nameGroup: 1 },
    { regex: /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(/m, nameGroup: 1 },
    { regex: /^module\.exports\s*=/m, nameGroup: 0 },
  ],
  python: [
    { regex: /^(?:async\s+)?def\s+(\w+)/m, nameGroup: 1 },
    { regex: /^class\s+(\w+)/m, nameGroup: 1 },
  ],
  go: [
    { regex: /^func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)/m, nameGroup: 1 },
    { regex: /^type\s+(\w+)\s+struct/m, nameGroup: 1 },
    { regex: /^type\s+(\w+)\s+interface/m, nameGroup: 1 },
  ],
  rust: [
    { regex: /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/m, nameGroup: 1 },
    { regex: /^(?:pub\s+)?struct\s+(\w+)/m, nameGroup: 1 },
    { regex: /^(?:pub\s+)?enum\s+(\w+)/m, nameGroup: 1 },
    { regex: /^(?:pub\s+)?trait\s+(\w+)/m, nameGroup: 1 },
    { regex: /^impl(?:<[^>]+>)?\s+(\w+)/m, nameGroup: 1 },
  ],
  java: [
    { regex: /^(?:public|private|protected)?\s*(?:static\s+)?(?:abstract\s+)?class\s+(\w+)/m, nameGroup: 1 },
    { regex: /^(?:public|private|protected)?\s*(?:static\s+)?(?:abstract\s+)?interface\s+(\w+)/m, nameGroup: 1 },
    { regex: /^(?:public|private|protected)?\s*(?:static\s+)?[\w<>\[\]]+\s+(\w+)\s*\(/m, nameGroup: 1 },
  ],
  kotlin: [
    { regex: /^(?:fun|suspend\s+fun)\s+(\w+)/m, nameGroup: 1 },
    { regex: /^(?:data\s+)?class\s+(\w+)/m, nameGroup: 1 },
    { regex: /^interface\s+(\w+)/m, nameGroup: 1 },
    { regex: /^object\s+(\w+)/m, nameGroup: 1 },
  ],
  ruby: [
    { regex: /^def\s+(\w+)/m, nameGroup: 1 },
    { regex: /^class\s+(\w+)/m, nameGroup: 1 },
    { regex: /^module\s+(\w+)/m, nameGroup: 1 },
  ],
  php: [
    { regex: /^(?:public|private|protected)?\s*(?:static\s+)?function\s+(\w+)/m, nameGroup: 1 },
    { regex: /^class\s+(\w+)/m, nameGroup: 1 },
    { regex: /^interface\s+(\w+)/m, nameGroup: 1 },
    { regex: /^trait\s+(\w+)/m, nameGroup: 1 },
  ],
  swift: [
    { regex: /^(?:public\s+|private\s+|internal\s+)?func\s+(\w+)/m, nameGroup: 1 },
    { regex: /^(?:public\s+|private\s+|internal\s+)?class\s+(\w+)/m, nameGroup: 1 },
    { regex: /^(?:public\s+|private\s+|internal\s+)?struct\s+(\w+)/m, nameGroup: 1 },
    { regex: /^(?:public\s+|private\s+|internal\s+)?protocol\s+(\w+)/m, nameGroup: 1 },
    { regex: /^(?:public\s+|private\s+|internal\s+)?enum\s+(\w+)/m, nameGroup: 1 },
  ],
  csharp: [
    { regex: /^(?:public|private|protected|internal)?\s*(?:static\s+)?(?:async\s+)?[\w<>\[\]]+\s+(\w+)\s*\(/m, nameGroup: 1 },
    { regex: /^(?:public|private|protected|internal)?\s*(?:abstract\s+|sealed\s+)?class\s+(\w+)/m, nameGroup: 1 },
    { regex: /^(?:public|private|protected|internal)?\s*interface\s+(\w+)/m, nameGroup: 1 },
  ],
  scala: [
    { regex: /^(?:def|override\s+def)\s+(\w+)/m, nameGroup: 1 },
    { regex: /^(?:case\s+)?class\s+(\w+)/m, nameGroup: 1 },
    { regex: /^(?:sealed\s+)?trait\s+(\w+)/m, nameGroup: 1 },
    { regex: /^object\s+(\w+)/m, nameGroup: 1 },
  ],
  c: [
    { regex: /^(?:static\s+)?(?:inline\s+)?[\w*]+\s+(\w+)\s*\(/m, nameGroup: 1 },
    { regex: /^typedef\s+struct\s+(\w+)/m, nameGroup: 1 },
    { regex: /^struct\s+(\w+)/m, nameGroup: 1 },
  ],
  cpp: [
    { regex: /^(?:virtual\s+|static\s+|inline\s+)?[\w:*<>]+\s+(\w+)\s*\(/m, nameGroup: 1 },
    { regex: /^class\s+(\w+)/m, nameGroup: 1 },
    { regex: /^struct\s+(\w+)/m, nameGroup: 1 },
    { regex: /^namespace\s+(\w+)/m, nameGroup: 1 },
    { regex: /^template/m, nameGroup: 0 },
  ],
  elixir: [
    { regex: /^def\s+(\w+)/m, nameGroup: 1 },
    { regex: /^defp\s+(\w+)/m, nameGroup: 1 },
    { regex: /^defmodule\s+(\w+)/m, nameGroup: 1 },
  ],
  haskell: [
    { regex: /^(\w+)\s*::/m, nameGroup: 1 },
    { regex: /^data\s+(\w+)/m, nameGroup: 1 },
    { regex: /^class\s+(\w+)/m, nameGroup: 1 },
    { regex: /^instance\s+(\w+)/m, nameGroup: 1 },
  ],
  dart: [
    { regex: /^(?:Future<[\w<>]+>|[\w<>]+)\s+(\w+)\s*\(/m, nameGroup: 1 },
    { regex: /^class\s+(\w+)/m, nameGroup: 1 },
    { regex: /^mixin\s+(\w+)/m, nameGroup: 1 },
  ],
  zig: [
    { regex: /^(?:pub\s+)?fn\s+(\w+)/m, nameGroup: 1 },
    { regex: /^const\s+(\w+)\s*=\s*struct/m, nameGroup: 1 },
  ],
};

interface SymbolBoundary {
  lineIndex: number;
  name: string;
}

function findSymbolBoundaries(lines: string[], language: string): SymbolBoundary[] {
  const patterns = SYMBOL_PATTERNS[language];
  if (!patterns) return [];

  const boundaries: SymbolBoundary[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    for (const pattern of patterns) {
      const match = trimmed.match(pattern.regex);
      if (match) {
        const name = pattern.nameGroup > 0 && match[pattern.nameGroup]
          ? match[pattern.nameGroup]
          : trimmed.slice(0, 40).trim();
        boundaries.push({ lineIndex: i, name });
        break;
      }
    }
  }

  return boundaries;
}

function symbolBasedChunking(
  lines: string[],
  filePath: string,
  language: string,
  maxChunkSize: number,
): Chunk[] {
  const boundaries = findSymbolBoundaries(lines, language);
  if (boundaries.length === 0) return [];

  const chunks: Chunk[] = [];

  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i].lineIndex;
    const end = i + 1 < boundaries.length ? boundaries[i + 1].lineIndex : lines.length;

    const chunkLines = lines.slice(start, end);
    const content = chunkLines.join("\n");

    // If this chunk is too large, skip it for symbol-based and let sliding window handle it
    if (content.length > maxChunkSize * 2) {
      continue;
    }

    chunks.push({
      content,
      filePath,
      language,
      startLine: start + 1,
      endLine: end,
      chunkType: "symbol",
      symbolName: boundaries[i].name,
    });
  }

  return chunks;
}

function slidingWindowChunking(
  lines: string[],
  filePath: string,
  language: string,
  chunkSize: number,
  chunkOverlap: number,
): Chunk[] {
  const fullText = lines.join("\n");
  if (fullText.length <= chunkSize) {
    return [
      {
        content: fullText,
        filePath,
        language,
        startLine: 1,
        endLine: lines.length,
        chunkType: "window",
      },
    ];
  }

  const chunks: Chunk[] = [];
  let currentChar = 0;

  while (currentChar < fullText.length) {
    const endChar = Math.min(currentChar + chunkSize, fullText.length);
    const chunkText = fullText.slice(currentChar, endChar);

    // Calculate line numbers
    const beforeChunk = fullText.slice(0, currentChar);
    const startLine = (beforeChunk.match(/\n/g) || []).length + 1;
    const endLine = startLine + (chunkText.match(/\n/g) || []).length;

    chunks.push({
      content: chunkText,
      filePath,
      language,
      startLine,
      endLine,
      chunkType: "window",
    });

    currentChar += chunkSize - chunkOverlap;
    if (endChar === fullText.length) break;
  }

  return chunks;
}

export function chunkFile(
  content: string,
  filePath: string,
  chunkSize: number = 1500,
  chunkOverlap: number = 200,
): Chunk[] {
  const language = getLanguageFromExtension(filePath);
  const lines = content.split("\n");

  // Try symbol-based chunking first
  const symbolChunks = symbolBasedChunking(lines, filePath, language, chunkSize);

  if (symbolChunks.length > 0) {
    // Check if symbols cover most of the file
    const coveredLines = new Set<number>();
    for (const chunk of symbolChunks) {
      for (let i = chunk.startLine; i <= chunk.endLine; i++) {
        coveredLines.add(i);
      }
    }

    const coverage = coveredLines.size / lines.length;

    // If symbols cover at least 50% of the file, use symbol-based chunking
    if (coverage >= 0.5) {
      return symbolChunks;
    }
  }

  // Fall back to sliding window
  return slidingWindowChunking(lines, filePath, language, chunkSize, chunkOverlap);
}
