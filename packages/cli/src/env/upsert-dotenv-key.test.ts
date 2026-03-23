import { describe, expect, test } from "bun:test";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatDotenvValue, upsertDotenvKey } from "./upsert-dotenv-key.js";

describe("formatDotenvValue", () => {
  test("quotes when needed", () => {
    expect(formatDotenvValue("a b")).toBe('"a b"');
    expect(formatDotenvValue('say "hi"')).toBe('"say \\"hi\\""');
  });

  test("plain when safe", () => {
    expect(formatDotenvValue("prod")).toBe("prod");
  });
});

describe("upsertDotenvKey", () => {
  test("creates file and replaces key", async () => {
    const dir = await mkdtemp(join(tmpdir(), "otavia-upsert-"));
    try {
      const p = join(dir, ".env");
      await upsertDotenvKey(p, "AWS_PROFILE", "dev");
      expect(await readFile(p, "utf8")).toContain("AWS_PROFILE=dev");
      await upsertDotenvKey(p, "AWS_PROFILE", "prod");
      const raw = await readFile(p, "utf8");
      expect(raw).toContain("AWS_PROFILE=prod");
      expect(raw).not.toContain("AWS_PROFILE=dev");
      await upsertDotenvKey(p, "OTHER", "1");
      expect(await readFile(p, "utf8")).toContain("OTHER=1");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("appends when key missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "otavia-upsert-"));
    try {
      const p = join(dir, ".env");
      await writeFile(p, "FOO=1\n", "utf8");
      await upsertDotenvKey(p, "BAR", "2");
      const raw = await readFile(p, "utf8");
      expect(raw).toContain("FOO=1");
      expect(raw).toContain("BAR=2");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
