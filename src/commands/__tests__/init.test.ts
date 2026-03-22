import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { loadOtaviaYaml } from "../../config/load-otavia-yaml";
import { initCommand } from "../init";

describe("initCommand", () => {
  test("creates monorepo packages, apps/main, hello cell, and valid otavia.yaml", () => {
    const root = mkdtempSync(join(tmpdir(), "otavia-init-"));
    try {
      initCommand(root, {
        stackName: "demo-stack",
        domain: "app.example.dev",
        packageScope: "@demo",
      });
      expect(existsSync(join(root, "apps", "main", "otavia.yaml"))).toBe(true);
      expect(existsSync(join(root, "package.json"))).toBe(true);
      expect(existsSync(join(root, "apps", "main", "package.json"))).toBe(true);
      expect(existsSync(join(root, "packages", "README.md"))).toBe(true);
      expect(existsSync(join(root, "cells", "hello", "cell.yaml"))).toBe(true);
      expect(existsSync(join(root, "cells", "hello", "backend", "app.ts"))).toBe(true);
      expect(existsSync(join(root, "cells", "hello", "backend", "handler.ts"))).toBe(true);
      expect(existsSync(join(root, "cells", "hello", "frontend", "shell.tsx"))).toBe(true);
      expect(existsSync(join(root, "apps", "main", ".env.example"))).toBe(true);
      expect(existsSync(join(root, "apps", "main", ".env"))).toBe(false);
      const otavia = loadOtaviaYaml(root);
      expect(otavia.stackName).toBe("demo-stack");
      expect(otavia.domain.host).toBe("app.example.dev");
      expect(otavia.cells.hello).toBe("@demo/hello");
      expect(otavia.defaultCell).toBe("hello");
      const mainPkg = JSON.parse(readFileSync(join(root, "apps", "main", "package.json"), "utf-8")) as {
        name?: string;
      };
      expect(mainPkg.name).toBe("@demo/main");
      const helloPkg = JSON.parse(readFileSync(join(root, "cells", "hello", "package.json"), "utf-8")) as {
        name?: string;
        devDependencies?: Record<string, string>;
      };
      expect(helloPkg.name).toBe("@demo/hello");
      expect(helloPkg.devDependencies?.react).toMatch(/^\^/);
      expect(helloPkg.devDependencies?.["react-dom"]).toMatch(/^\^/);
      expect(helloPkg.devDependencies?.vite).toBeUndefined();
      const rootPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8")) as {
        workspaces?: string[];
        scripts?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      expect(rootPkg.devDependencies?.react).toBeUndefined();
      expect(rootPkg.workspaces).toEqual(["packages/*", "cells/*", "apps/*"]);
      expect(rootPkg.scripts?.dev).toBe("bun run --cwd apps/main dev");
      expect(rootPkg.scripts?.aws).toBe("bun run --cwd apps/main aws");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("refuses to overwrite without --force", () => {
    const root = mkdtempSync(join(tmpdir(), "otavia-init-"));
    try {
      mkdirSync(join(root, "apps", "main"), { recursive: true });
      writeFileSync(
        join(root, "apps", "main", "otavia.yaml"),
        "stackName: x\ndomain:\n  host: h\ncells:\n  a: '@otavia/a'\n",
        "utf-8"
      );
      expect(() => initCommand(root, { packageScope: "@test" })).toThrow(/already exists/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("appends common entries to existing .gitignore", () => {
    const root = mkdtempSync(join(tmpdir(), "otavia-init-"));
    try {
      writeFileSync(join(root, ".gitignore"), "custom\n", "utf-8");
      initCommand(root, { stackName: "s", domain: "d.example.com", packageScope: "@demo" });
      const gi = readFileSync(join(root, ".gitignore"), "utf-8");
      expect(gi).toContain("custom");
      expect(gi).toContain("node_modules/");
      expect(gi).toContain(".otavia/");
      expect(gi).toContain("apps/main/.env");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
