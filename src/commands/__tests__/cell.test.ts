import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { listCellsCommand } from "../cell.js";

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
