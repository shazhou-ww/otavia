import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "./init.js";

describe("runInit", () => {
  test("scaffold aws workspace with otavia.yaml region", async () => {
    const dir = await mkdtemp(join(tmpdir(), "otavia-init-"));
    try {
      await runInit(dir, { provider: "aws" });
      const yaml = await readFile(join(dir, "stacks", "main", "otavia.yaml"), "utf8");
      expect(yaml).toContain("cloud:");
      expect(yaml).toContain("provider: aws");
      expect(yaml).toContain("region:");
      expect(yaml).not.toContain("location:");
      const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8")) as {
        workspaces: string[];
        devDependencies?: Record<string, string>;
      };
      expect(pkg.workspaces).toEqual(["stacks/*", "cells/*", "packages/*"]);
      expect(pkg.devDependencies?.["@otavia/cli"]).toBe("0.0.1");
      expect(pkg.devDependencies?.typescript).toBe("^5.8.3");
      const stackPkg = JSON.parse(
        await readFile(join(dir, "stacks", "main", "package.json"), "utf8")
      ) as { scripts?: Record<string, string> };
      expect(stackPkg.scripts?.dev).toBe("otavia dev");
      expect(stackPkg.scripts?.test).toBe("bun test test/unit test/e2e");
      expect(stackPkg.scripts?.["test:all"]).toBe("otavia test");
      await readFile(join(dir, "cells", "hello", "test", "unit", "handler.test.ts"), "utf8");
      await readFile(join(dir, "cells", "hello", "cell.yaml"), "utf8");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("scaffold azure workspace with location", async () => {
    const dir = await mkdtemp(join(tmpdir(), "otavia-init-"));
    try {
      await runInit(dir, { provider: "azure" });
      const yaml = await readFile(join(dir, "stacks", "main", "otavia.yaml"), "utf8");
      expect(yaml).toContain("cloud:");
      expect(yaml).toContain("provider: azure");
      expect(yaml).toContain("location:");
      expect(yaml).not.toContain("region:");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("refuses non-empty directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "otavia-init-"));
    await writeFile(join(dir, "x.txt"), "x", "utf8");
    await expect(runInit(dir, { provider: "aws" })).rejects.toThrow(/not empty/);
    await rm(dir, { recursive: true, force: true });
  });
});
