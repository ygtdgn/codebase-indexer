import path from "node:path";

export interface Config {
  ollamaUrl: string;
  qdrantUrl: string;
  model: string;
  embeddingDim: number;
  chunkSize: number;
  chunkOverlap: number;
  maxFileSize: number;
  batchSize: number;
  concurrency: number;
  watch: boolean;
  directory: string;
  collectionName: string;
  ignoreDirs: string[];
  ignoreFiles: string[];
  codeExtensions: string[];
}

const defaults: Config = {
  ollamaUrl: "http://localhost:11434",
  qdrantUrl: "http://localhost:6333",
  model: "qwen3-embedding:0.6b",
  embeddingDim: 512,
  chunkSize: 1500,
  chunkOverlap: 200,
  maxFileSize: 1_000_000,
  batchSize: 16,
  concurrency: 4,
  watch: true,
  directory: ".",
  collectionName: "codebase",
  ignoreDirs: [
    "node_modules",
    ".git",
    ".hg",
    ".svn",
    "dist",
    "build",
    "out",
    ".next",
    ".nuxt",
    "__pycache__",
    ".venv",
    "venv",
    ".env",
    "vendor",
    "target",
    ".idea",
    ".vscode",
    ".claude",
    "coverage",
    ".nyc_output",
    ".turbo",
    ".cache",
  ],
  ignoreFiles: [
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "bun.lockb",
    "composer.lock",
    "Gemfile.lock",
    "poetry.lock",
    "Pipfile.lock",
    "Cargo.lock",
    "go.sum",
    "packages.lock.json",
    "pubspec.lock",
    "mix.lock",
    "shrinkwrap.yaml",
  ],
  codeExtensions: [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".py",
    ".go",
    ".rs",
    ".java",
    ".kt",
    ".kts",
    ".scala",
    ".c",
    ".cpp",
    ".cc",
    ".h",
    ".hpp",
    ".cs",
    ".rb",
    ".php",
    ".swift",
    ".m",
    ".mm",
    ".r",
    ".R",
    ".lua",
    ".pl",
    ".pm",
    ".sh",
    ".bash",
    ".zsh",
    ".fish",
    ".ps1",
    ".sql",
    ".graphql",
    ".gql",
    ".proto",
    ".yaml",
    ".yml",
    ".toml",
    ".json",
    ".xml",
    ".html",
    ".css",
    ".scss",
    ".less",
    ".sass",
    ".vue",
    ".svelte",
    ".astro",
    ".md",
    ".mdx",
    ".txt",
    ".cfg",
    ".ini",
    ".conf",
    ".env",
    ".dockerfile",
    ".tf",
    ".hcl",
    ".zig",
    ".nim",
    ".dart",
    ".ex",
    ".exs",
    ".erl",
    ".hrl",
    ".hs",
    ".ml",
    ".mli",
    ".clj",
    ".cljs",
    ".el",
    ".vim",
  ],
};

export function resolveConfig(overrides: Partial<Config> = {}): Config {
  const envOverrides: Partial<Config> = {};

  if (process.env.OLLAMA_URL) envOverrides.ollamaUrl = process.env.OLLAMA_URL;
  if (process.env.QDRANT_URL) envOverrides.qdrantUrl = process.env.QDRANT_URL;
  if (process.env.EMBEDDING_MODEL) envOverrides.model = process.env.EMBEDDING_MODEL;
  if (process.env.EMBEDDING_DIM) envOverrides.embeddingDim = parseInt(process.env.EMBEDDING_DIM, 10);
  if (process.env.COLLECTION_NAME) envOverrides.collectionName = process.env.COLLECTION_NAME;

  const result = { ...defaults, ...envOverrides, ...overrides };

  // Auto-derive collection name from directory when using the default
  if (result.collectionName === "codebase" && result.directory !== ".") {
    const dirName = path.basename(path.resolve(result.directory));
    result.collectionName = `codebase-${dirName.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;
  }

  return result;
}
