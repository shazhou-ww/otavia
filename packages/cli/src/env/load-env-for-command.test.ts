import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { loadEnvForCommand, parseDotenvContent } from "./load-env-for-command.js";

describe("parseDotenvContent", () => {
  test("parses simple pairs and skips comments", () => {
    expect(
      parseDotenvContent("FOO=bar\n# x\n\nBAZ=qux")
    ).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  test("strips matching quotes", () => {
    expect(parseDotenvContent('X="y"')).toEqual({ X: "y" });
    expect(parseDotenvContent("Z='w'")).toEqual({ Z: "w" });
  });
});

describe("loadEnvForCommand", () => {
  function tempStackRoot(): string {
    return mkdtempSync(join(tmpdir(), "otavia-env-"));
  }

  test("returns empty object when no files exist", () => {
    const root = tempStackRoot();
    expect(loadEnvForCommand(root, "dev")).toEqual({});
  });

  test("loads only .env when command file missing", () => {
    const root = tempStackRoot();
    writeFileSync(join(root, ".env"), "A=1\nB=2\n", "utf-8");
    expect(loadEnvForCommand(root, "deploy")).toEqual({ A: "1", B: "2" });
  });

  test("command-specific file overrides .env", () => {
    const root = tempStackRoot();
    writeFileSync(join(root, ".env"), "A=base\nB=base\n", "utf-8");
    writeFileSync(join(root, ".env.test"), "B=override\nC=extra\n", "utf-8");
    expect(loadEnvForCommand(root, "test")).toEqual({
      A: "base",
      B: "override",
      C: "extra",
    });
  });

  test("uses .env.dev for dev command", () => {
    const root = tempStackRoot();
    writeFileSync(join(root, ".env"), "X=1\n", "utf-8");
    writeFileSync(join(root, ".env.dev"), "X=dev\n", "utf-8");
    expect(loadEnvForCommand(root, "dev")).toEqual({ X: "dev" });
  });
});
