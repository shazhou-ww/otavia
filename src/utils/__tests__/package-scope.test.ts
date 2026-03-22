import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import {
  defaultPackageScopeFromDir,
  normalizePackageScope,
  scopedPackageName,
} from "../package-scope";

describe("normalizePackageScope", () => {
  test("accepts org with or without @", () => {
    expect(normalizePackageScope("acme")).toBe("@acme");
    expect(normalizePackageScope("@acme")).toBe("@acme");
  });

  test("throws on empty", () => {
    expect(() => normalizePackageScope("")).toThrow(/empty/);
  });
});

describe("scopedPackageName", () => {
  test("builds @org/slug", () => {
    expect(scopedPackageName("@demo", "main")).toBe("@demo/main");
    expect(scopedPackageName("demo", "hello")).toBe("@demo/hello");
  });
});

describe("defaultPackageScopeFromDir", () => {
  test("derives from directory name", () => {
    const root = join(tmpdir(), `otavia-scope-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    try {
      expect(defaultPackageScopeFromDir(root)).toBe(`@${basename(root)}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
