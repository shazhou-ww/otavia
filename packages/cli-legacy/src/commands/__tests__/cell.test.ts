import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { loadOtaviaYamlAt } from "../../config/load-otavia-yaml";
import { createCellCommand, listCellsCommand } from "../cell";
import { validateCellMount } from "../cell-scaffold";

describe("listCellsCommand", () => {
  test("prints mounts and paths for cells in otavia.yaml", () => {
    const root = mkdtempSync(join(tmpdir(), "otavia-cell-list-"));
    try {
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({
          name: "cell-test-ws",
          private: true,
          workspaces: ["apps/*", "cells/*"],
        }),
        "utf-8"
      );
      mkdirSync(join(root, "apps", "main"), { recursive: true });
      writeFileSync(
        join(root, "apps", "main", "otavia.yaml"),
        `
stackName: test-stack
domain:
  host: example.com
cells:
  sso: "@otavia/sso"
  drive: "@otavia/drive"
`,
        "utf-8"
      );
      const ssoDir = join(root, "cells", "sso");
      mkdirSync(ssoDir, { recursive: true });
      writeFileSync(join(ssoDir, "cell.yaml"), "name: sso\n", "utf-8");

      const lines: string[] = [];
      const origLog = console.log;
      console.log = (...args: unknown[]) => {
        lines.push(args.map(String).join(" "));
      };
      try {
        listCellsCommand(root);
      } finally {
        console.log = origLog;
      }

      expect(lines.some((l) => l.includes("sso") && l.includes("@otavia/sso"))).toBe(true);
      expect(lines.some((l) => l.includes("drive") && l.includes("(no cell.yaml)"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("validateCellMount", () => {
  test("accepts valid segments", () => {
    expect(validateCellMount("billing")).toBe("billing");
    expect(validateCellMount("api-v1")).toBe("api-v1");
    expect(validateCellMount("a")).toBe("a");
  });

  test("rejects invalid segments", () => {
    expect(() => validateCellMount("")).toThrow(/empty/);
    expect(() => validateCellMount("Bad")).toThrow(/Invalid/);
    expect(() => validateCellMount("-x")).toThrow(/Invalid/);
    expect(() => validateCellMount("x-")).toThrow(/Invalid/);
  });
});

describe("createCellCommand", () => {
  test("scaffolds cell and updates otavia.yaml", () => {
    const root = mkdtempSync(join(tmpdir(), "otavia-cell-create-"));
    try {
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({
          name: "cell-create-ws",
          private: true,
          workspaces: ["apps/*", "cells/*"],
        }),
        "utf-8"
      );
      mkdirSync(join(root, "apps", "main"), { recursive: true });
      writeFileSync(
        join(root, "apps", "main", "otavia.yaml"),
        `stackName: s
domain:
  host: example.com
cells:
  hello: "@demo/hello"
`,
        "utf-8"
      );
      mkdirSync(join(root, "cells", "hello"), { recursive: true });
      writeFileSync(join(root, "cells", "hello", "cell.yaml"), "name: hello\n", "utf-8");

      const lines: string[] = [];
      const origLog = console.log;
      console.log = (...args: unknown[]) => {
        lines.push(args.map(String).join(" "));
      };
      try {
        createCellCommand(root, "billing", {});
      } finally {
        console.log = origLog;
      }

      expect(existsSync(join(root, "cells", "billing", "cell.yaml"))).toBe(true);
      expect(existsSync(join(root, "cells", "billing", "backend", "handler.ts"))).toBe(true);
      const otavia = loadOtaviaYamlAt(join(root, "apps", "main"));
      expect(otavia.cells.billing).toBe("@demo/billing");
      expect(lines.some((l) => l.includes("billing") && l.includes("@demo/billing"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("throws when mount already in otavia.yaml", () => {
    const root = mkdtempSync(join(tmpdir(), "otavia-cell-create-dup-"));
    try {
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({ name: "x", private: true, workspaces: ["apps/*", "cells/*"] }),
        "utf-8"
      );
      mkdirSync(join(root, "apps", "main"), { recursive: true });
      writeFileSync(
        join(root, "apps", "main", "otavia.yaml"),
        "stackName: s\ndomain:\n  host: h\ncells:\n  hello: \"@a/hello\"\n",
        "utf-8"
      );
      mkdirSync(join(root, "cells", "hello"), { recursive: true });
      writeFileSync(join(root, "cells", "hello", "cell.yaml"), "name: hello\n", "utf-8");

      expect(() => createCellCommand(root, "hello", {})).toThrow(/already registered/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("--scope overrides inferred scope", () => {
    const root = mkdtempSync(join(tmpdir(), "otavia-cell-create-scope-"));
    try {
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({ name: "x", private: true, workspaces: ["apps/*", "cells/*"] }),
        "utf-8"
      );
      mkdirSync(join(root, "apps", "main"), { recursive: true });
      writeFileSync(
        join(root, "apps", "main", "otavia.yaml"),
        "stackName: s\ndomain:\n  host: h\ncells:\n  hello: \"@demo/hello\"\n",
        "utf-8"
      );
      mkdirSync(join(root, "cells", "hello"), { recursive: true });
      writeFileSync(join(root, "cells", "hello", "cell.yaml"), "name: hello\n", "utf-8");

      const origLog = console.log;
      console.log = () => {};
      try {
        createCellCommand(root, "other", { scope: "acme" });
      } finally {
        console.log = origLog;
      }

      const otavia = loadOtaviaYamlAt(join(root, "apps", "main"));
      expect(otavia.cells.other).toBe("@acme/other");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
