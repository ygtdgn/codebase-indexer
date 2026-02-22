import gradient from "gradient-string";
import boxen from "boxen";

type Mood = "welcome" | "indexing" | "success" | "error";

const faces: Record<Mood, string> = {
  welcome: "( \u2022.\u2022)",
  indexing: "( \u00b0.\u00b0)",
  success: "( ^.^)",
  error:   "( \u00d7.\u00d7)",
};

const squirrelGradient = gradient(["#d97706", "#ea580c"]);

function mascotLines(mood: Mood, message: string): string[] {
  return [
    `  /\\_/\\`,
    ` ${faces[mood]}  ${message}`,
    `\u2282/ \ud83c\udf30 \\\u2283`,
    ` /|   |\\`,
  ];
}

export function printWelcome(): void {
  const content = [
    "",
    `    /\\_/\\   codebase-indexer`,
    `   ${faces.welcome}  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`,
    ` \u2282/ \ud83c\udf30 \\\u2283  Semantic code search`,
    `  /|   |\\   powered by AI`,
    "",
  ].join("\n");

  const box = boxen(content, {
    borderStyle: "round",
    padding: { left: 1, right: 1, top: 0, bottom: 0 },
    borderColor: "yellow",
  });

  console.log(squirrelGradient(box));
}

export function printMascot(mood: Mood, message: string): void {
  const lines = mascotLines(mood, message);
  const art = lines.map((l) => `  ${l}`).join("\n");
  console.log(squirrelGradient(art));
}
