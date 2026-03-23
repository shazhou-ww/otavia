import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { writeFile, readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { copyEnvExampleIfMissing, runSetup } from "./setup.js";

describe("copyEnvExampleIfMissing", () => {
  test("creates .env from .env.example when .env missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "otavia-setup-"));
    try {
      await writeFile(join(dir, ".env.example"), "X=1\n", "utf8");
      const created = await copyEnvExampleIfMissing(dir);
      expect(created).toBe(true);
      expect(await readFile(join(dir, ".env"), "utf8")).toContain("X=1");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("does not overwrite existing .env", async () => {
    const dir = await mkdtemp(join(tmpdir(), "otavia-setup-"));
    try {
      await writeFile(join(dir, ".env.example"), "X=1\n", "utf8");
      await writeFile(join(dir, ".env"), "X=keep\n", "utf8");
      const created = await copyEnvExampleIfMissing(dir);
      expect(created).toBe(false);
      expect(await readFile(join(dir, ".env"), "utf8")).toContain("keep");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("runSetup", () => {
  test("throws when not inside a workspace", async () => {
    const dir = await mkdtemp(join(tmpdir(), "otavia-setup-"));
    try {
      await expect(runSetup(dir)).rejects.toThrow(/workspace/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("buildStackModel succeeds in minimal-workspace fixture (toolchain skipped)", async () => {
    const commandsDir = dirname(fileURLToPath(import.meta.url));
    const fixtureWs = join(commandsDir, "../../../stack/test-fixtures/minimal-workspace");
    const prev = process.env.OTAVIA_SETUP_SKIP_TOOLCHAIN;
    const prevIdentity = process.env.OTAVIA_SETUP_SKIP_CLOUD_IDENTITY;
    process.env.OTAVIA_SETUP_SKIP_TOOLCHAIN = "1";
    process.env.OTAVIA_SETUP_SKIP_CLOUD_IDENTITY = "1";
    try {
      const r = spawnSync("bun", ["install", "--no-cache"], {
        cwd: fixtureWs,
        shell: true,
        encoding: "utf8",
      });
      if (r.status !== 0) {
        throw new Error(r.stderr || r.stdout || "bun install failed");
      }
      await runSetup(join(fixtureWs, "stacks", "main"));
    } finally {
      if (prev === undefined) delete process.env.OTAVIA_SETUP_SKIP_TOOLCHAIN;
      else process.env.OTAVIA_SETUP_SKIP_TOOLCHAIN = prev;
      if (prevIdentity === undefined) delete process.env.OTAVIA_SETUP_SKIP_CLOUD_IDENTITY;
      else process.env.OTAVIA_SETUP_SKIP_CLOUD_IDENTITY = prevIdentity;
    }
  });
});
