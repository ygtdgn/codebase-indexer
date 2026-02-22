import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { glob } from "glob";
import ignore, { type Ignore } from "ignore";
import type { Config } from "../config/config.js";

export async function loadGitignore(directory: string): Promise<Ignore> {
  const ig = ignore();

  const gitignorePath = path.join(directory, ".gitignore");
  try {
    const content = await readFile(gitignorePath, "utf-8");
    ig.add(content);
  } catch {
    // No .gitignore, that's fine
  }

  return ig;
}

export async function discoverFiles(
  directory: string,
  config: Config,
): Promise<string[]> {
  const absDir = path.resolve(directory);
  const ig = await loadGitignore(absDir);

  // Add configured ignore dirs to ignore rules
  for (const dir of config.ignoreDirs) {
    ig.add(dir);
  }

  // Build glob pattern for code extensions
  const extensions = config.codeExtensions.map((ext) => ext.replace(/^\./, ""));
  const pattern =
    extensions.length === 1
      ? `**/*.${extensions[0]}`
      : `**/*.{${extensions.join(",")}}`;

  const files = await glob(pattern, {
    cwd: absDir,
    nodir: true,
    dot: false,
    absolute: false,
  });

  // Filter with gitignore and max file size
  const results: string[] = [];

  for (const file of files) {
    if (ig.ignores(file)) continue;

    const absPath = path.join(absDir, file);
    try {
      const s = await stat(absPath);
      if (s.size <= config.maxFileSize) {
        results.push(file);
      }
    } catch {
      // Skip inaccessible files
    }
  }

  return results.sort();
}

export async function readFileContent(filePath: string): Promise<string> {
  return readFile(filePath, "utf-8");
}

export function getLanguageFromExtension(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".py": "python",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".kt": "kotlin",
    ".kts": "kotlin",
    ".scala": "scala",
    ".c": "c",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".h": "c",
    ".hpp": "cpp",
    ".cs": "csharp",
    ".rb": "ruby",
    ".php": "php",
    ".swift": "swift",
    ".m": "objectivec",
    ".mm": "objectivec",
    ".r": "r",
    ".R": "r",
    ".lua": "lua",
    ".pl": "perl",
    ".pm": "perl",
    ".sh": "shell",
    ".bash": "shell",
    ".zsh": "shell",
    ".fish": "shell",
    ".ps1": "powershell",
    ".sql": "sql",
    ".graphql": "graphql",
    ".gql": "graphql",
    ".proto": "protobuf",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".json": "json",
    ".xml": "xml",
    ".html": "html",
    ".css": "css",
    ".scss": "scss",
    ".less": "less",
    ".sass": "sass",
    ".vue": "vue",
    ".svelte": "svelte",
    ".astro": "astro",
    ".md": "markdown",
    ".mdx": "markdown",
    ".dockerfile": "dockerfile",
    ".tf": "terraform",
    ".hcl": "hcl",
    ".zig": "zig",
    ".nim": "nim",
    ".dart": "dart",
    ".ex": "elixir",
    ".exs": "elixir",
    ".erl": "erlang",
    ".hrl": "erlang",
    ".hs": "haskell",
    ".ml": "ocaml",
    ".mli": "ocaml",
    ".clj": "clojure",
    ".cljs": "clojure",
    ".el": "elisp",
    ".vim": "vim",
  };
  return map[ext] ?? "text";
}
