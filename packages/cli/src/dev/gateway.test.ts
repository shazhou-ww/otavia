import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildStackModel } from "@otavia/stack";
import { mergeProcessAndFileEnv } from "../env/merge-process-env.js";
import { runDevGateway } from "./gateway.js";

describe("runDevGateway", () => {
  test("redirects / to first mount for minimal-workspace fixture", async () => {
    const commandsDir = dirname(fileURLToPath(import.meta.url));
    const fixtureWs = join(commandsDir, "../../../stack/test-fixtures/minimal-workspace");
    const r = spawnSync("bun", ["install", "--no-cache"], {
      cwd: fixtureWs,
      shell: true,
      encoding: "utf8",
    });
    if (r.status !== 0) {
      throw new Error(r.stderr || r.stdout || "bun install failed");
    }
    const stackRoot = join(fixtureWs, "stacks", "main");
    const model = buildStackModel({
      stackRoot,
      workspaceRoot: fixtureWs,
      env: mergeProcessAndFileEnv({}),
    });
    const gw = await runDevGateway(model, {}, 0);
    try {
      const res = await fetch(`http://127.0.0.1:${gw.port}/`, { redirect: "manual" });
      expect(res.status).toBe(301);
      expect(res.headers.get("location")).toMatch(/\/hello\//);
    } finally {
      gw.stop();
    }
  });
});
