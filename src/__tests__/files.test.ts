import { describe, it, expect } from "vitest";
import { getLanguageFromExtension } from "../utils/files.js";

describe("getLanguageFromExtension", () => {
  it("should map .ts to typescript", () => {
    expect(getLanguageFromExtension("foo.ts")).toBe("typescript");
  });

  it("should map .tsx to typescript", () => {
    expect(getLanguageFromExtension("component.tsx")).toBe("typescript");
  });

  it("should map .js to javascript", () => {
    expect(getLanguageFromExtension("index.js")).toBe("javascript");
  });

  it("should map .py to python", () => {
    expect(getLanguageFromExtension("script.py")).toBe("python");
  });

  it("should map .go to go", () => {
    expect(getLanguageFromExtension("main.go")).toBe("go");
  });

  it("should map .rs to rust", () => {
    expect(getLanguageFromExtension("lib.rs")).toBe("rust");
  });

  it("should map .java to java", () => {
    expect(getLanguageFromExtension("Main.java")).toBe("java");
  });

  it("should map .rb to ruby", () => {
    expect(getLanguageFromExtension("app.rb")).toBe("ruby");
  });

  it("should map .vue to vue", () => {
    expect(getLanguageFromExtension("App.vue")).toBe("vue");
  });

  it("should map .svelte to svelte", () => {
    expect(getLanguageFromExtension("Page.svelte")).toBe("svelte");
  });

  it("should return 'text' for unknown extension", () => {
    expect(getLanguageFromExtension("readme.xyz")).toBe("text");
  });

  it("should return 'text' for file with no extension", () => {
    expect(getLanguageFromExtension("Makefile")).toBe("text");
  });

  it("should handle paths with directories", () => {
    expect(getLanguageFromExtension("src/utils/helper.ts")).toBe("typescript");
  });

  it("should be case-insensitive for extension", () => {
    // .R is mapped, but .r is also mapped
    expect(getLanguageFromExtension("stats.R")).toBe("r");
    expect(getLanguageFromExtension("stats.r")).toBe("r");
  });
});
