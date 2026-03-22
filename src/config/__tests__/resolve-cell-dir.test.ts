import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { resolveCellDir } from "../resolve-cell-dir.js";

function writeCellYaml(dir: string) {
  writeFileSync(join(dir, "cell.yaml"), "name: test\n", "utf-8");
}

describe("resolveCellDir", () => {
  test("mount-only prefers cells/<mount> when cell.yaml exists", () => {
    const root = mkdtempSync(join(tmpdir(), "otavia-rcd-"));
    try {
      const cells = join(root, "cells", "sso");
      mkdirSync(cells, { recursive: true });
      writeCellYaml(cells);
      expect(resolveCellDir(root, "sso")).toBe(cells);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("scoped package prefers cells/<slug> over node_modules when both have cell.yaml", () => {
    const root = mkdtempSync(join(tmpdir(), "otavia-rcd-"));
    try {
      const cells = join(root, "cells", "sso");
      mkdirSync(cells, { recursive: true });
      writeCellYaml(cells);
      const nm = join(root, "node_modules", "@otavia", "sso");
      mkdirSync(nm, { recursive: true });
      writeCellYaml(nm);
      expect(resolveCellDir(root, "@otavia/sso")).toBe(cells);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("scoped package uses node_modules when cells has no cell.yaml", () => {
    const root = mkdtempSync(join(tmpdir(), "otavia-rcd-"));
    try {
      mkdirSync(join(root, "cells", "sso"), { recursive: true });
      const nm = join(root, "node_modules", "@otavia", "sso");
      mkdirSync(nm, { recursive: true });
      writeCellYaml(nm);
      expect(resolveCellDir(root, "@otavia/sso")).toBe(nm);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("scoped package defaults to cells/<slug> path when nothing resolves", () => {
    const root = mkdtempSync(join(tmpdir(), "otavia-rcd-"));
    try {
      expect(resolveCellDir(root, "@otavia/sso")).toBe(join(root, "cells", "sso"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
