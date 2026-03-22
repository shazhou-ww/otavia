import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { loadOtaviaYaml } from "../../config/load-otavia-yaml.js";
import { initCommand } from "../init.js";

describe("initCommand", () => {
  test("creates otavia.yaml, cells/app/cell.yaml, and valid config", () => {
    const root = mkdtempSync(join(tmpdir(), "otavia-init-"));
    try {
      initCommand(root, { stackName: "demo-stack", domain: "app.example.dev" });
      expect(existsSync(join(root, "otavia.yaml"))).toBe(true);
      expect(existsSync(join(root, "cells", "app", "cell.yaml"))).toBe(true);
      const otavia = loadOtaviaYaml(root);
      expect(otavia.stackName).toBe("demo-stack");
      expect(otavia.domain.host).toBe("app.example.dev");
      expect(otavia.cells.app).toBe("@otavia/app");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("refuses to overwrite without --force", () => {
    const root = mkdtempSync(join(tmpdir(), "otavia-init-"));
    try {
      writeFileSync(join(root, "otavia.yaml"), "stackName: x\ndomain:\n  host: h\ncells:\n  a: '@otavia/a'\n", "utf-8");
      expect(() => initCommand(root, {})).toThrow(/already exists/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("appends common entries to existing .gitignore", () => {
    const root = mkdtempSync(join(tmpdir(), "otavia-init-"));
    try {
      writeFileSync(join(root, ".gitignore"), "custom\n", "utf-8");
      initCommand(root, { stackName: "s", domain: "d.example.com" });
      const gi = readFileSync(join(root, ".gitignore"), "utf-8");
      expect(gi).toContain("custom");
      expect(gi).toContain("node_modules/");
      expect(gi).toContain(".otavia/");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
