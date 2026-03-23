import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import {
  findWorkspaceRootWithWorkspaces,
  monorepoRootForCells,
  resolveOtaviaWorkspacePaths,
} from "../resolve-otavia-workspace";

const MINIMAL_OTAVIA = "stackName: s\ndomain:\n  host: h\ncells:\n  x: '@otavia/x'\n";

function writeWorkspaceRootPackageJson(root: string): void {
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      name: "ws-root",
      private: true,
      workspaces: ["apps/*", "cells/*", "packages/*"],
    }),
    "utf-8"
  );
}

describe("monorepoRootForCells", () => {
  test("strips every .../apps/main suffix (nested mistake)", () => {
    const root = mkdtempSync(join(tmpdir(), "otavia-ws-"));
    const nested = join(root, "apps", "main", "apps", "main");
    try {
      mkdirSync(nested, { recursive: true });
      expect(monorepoRootForCells(nested)).toBe(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("legacy config dir at repo root is unchanged", () => {
    const root = mkdtempSync(join(tmpdir(), "otavia-ws-"));
    try {
      expect(monorepoRootForCells(root)).toBe(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("findWorkspaceRootWithWorkspaces", () => {
  test("finds root package.json with workspaces", () => {
    const root = mkdtempSync(join(tmpdir(), "otavia-ws-"));
    const deep = join(root, "apps", "main");
    try {
      writeWorkspaceRootPackageJson(root);
      mkdirSync(deep, { recursive: true });
      expect(findWorkspaceRootWithWorkspaces(deep)).toBe(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("resolveOtaviaWorkspacePaths", () => {
  test("from workspace root finds apps/main stack and monorepoRoot is workspace root", () => {
    const root = mkdtempSync(join(tmpdir(), "otavia-ws-"));
    try {
      writeWorkspaceRootPackageJson(root);
      mkdirSync(join(root, "apps", "main"), { recursive: true });
      writeFileSync(join(root, "apps", "main", "otavia.yaml"), MINIMAL_OTAVIA, "utf-8");
      const w = resolveOtaviaWorkspacePaths(root);
      expect(w.monorepoRoot).toBe(root);
      expect(w.configDir).toBe(join(root, "apps", "main"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("from apps/main cwd: monorepoRoot is workspace root", () => {
    const root = mkdtempSync(join(tmpdir(), "otavia-ws-"));
    const mainDir = join(root, "apps", "main");
    try {
      writeWorkspaceRootPackageJson(root);
      mkdirSync(mainDir, { recursive: true });
      writeFileSync(join(mainDir, "otavia.yaml"), MINIMAL_OTAVIA, "utf-8");
      const w = resolveOtaviaWorkspacePaths(mainDir);
      expect(w.monorepoRoot).toBe(root);
      expect(w.configDir).toBe(mainDir);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("does not assume apps/main: apps/console/otavia.yaml resolves", () => {
    const root = mkdtempSync(join(tmpdir(), "otavia-ws-"));
    const consoleDir = join(root, "apps", "console");
    try {
      writeWorkspaceRootPackageJson(root);
      mkdirSync(consoleDir, { recursive: true });
      writeFileSync(join(consoleDir, "otavia.yaml"), MINIMAL_OTAVIA, "utf-8");
      const w = resolveOtaviaWorkspacePaths(consoleDir);
      expect(w.monorepoRoot).toBe(root);
      expect(w.configDir).toBe(consoleDir);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("from cells/* cwd discovers stack via apps/*/otavia.yaml scan", () => {
    const root = mkdtempSync(join(tmpdir(), "otavia-ws-"));
    const cellDir = join(root, "cells", "hello");
    try {
      writeWorkspaceRootPackageJson(root);
      mkdirSync(join(root, "apps", "main"), { recursive: true });
      mkdirSync(cellDir, { recursive: true });
      writeFileSync(join(root, "apps", "main", "otavia.yaml"), MINIMAL_OTAVIA, "utf-8");
      const w = resolveOtaviaWorkspacePaths(cellDir);
      expect(w.monorepoRoot).toBe(root);
      expect(w.configDir).toBe(join(root, "apps", "main"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("nested apps/main/apps/main/otavia.yaml still prefers real apps/main/otavia.yaml", () => {
    const root = mkdtempSync(join(tmpdir(), "otavia-ws-"));
    const mainDir = join(root, "apps", "main");
    const nestedMain = join(mainDir, "apps", "main");
    try {
      writeWorkspaceRootPackageJson(root);
      mkdirSync(nestedMain, { recursive: true });
      writeFileSync(join(mainDir, "otavia.yaml"), MINIMAL_OTAVIA, "utf-8");
      writeFileSync(
        join(nestedMain, "otavia.yaml"),
        "stackName: nested\ndomain:\n  host: h\ncells:\n  x: '@otavia/x'\n",
        "utf-8"
      );
      const w = resolveOtaviaWorkspacePaths(mainDir);
      expect(w.monorepoRoot).toBe(root);
      expect(w.configDir).toBe(mainDir);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("legacy: no workspaces, otavia.yaml in parent chain", () => {
    const root = mkdtempSync(join(tmpdir(), "otavia-legacy-"));
    const sub = join(root, "src");
    try {
      mkdirSync(sub, { recursive: true });
      writeFileSync(join(root, "package.json"), JSON.stringify({ name: "solo", private: true }), "utf-8");
      writeFileSync(join(root, "otavia.yaml"), MINIMAL_OTAVIA, "utf-8");
      const w = resolveOtaviaWorkspacePaths(sub);
      expect(w.monorepoRoot).toBe(root);
      expect(w.configDir).toBe(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
