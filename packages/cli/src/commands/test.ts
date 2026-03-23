import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { cwd } from "node:process";
import { buildStackModel } from "@otavia/stack";
import { loadEnvForCommand } from "../env/load-env-for-command.js";
import { mergeProcessAndFileEnv } from "../env/merge-process-env.js";
import { bunExecutable } from "../utils/bun-executable.js";
import { findStackRoot } from "../resolve/find-stack-root.js";
import { findWorkspaceRoot } from "../resolve/find-workspace-root.js";
import { collectStackAndCellDirs } from "./collect-workspace-dirs.js";

function runTestsInDir(dir: string, extraEnv: Record<string, string>): number {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) return 0;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { scripts?: { test?: string } };
  if (!pkg.scripts?.test) {
    console.log(`[otavia test] skip (no test script): ${dir}`);
    return 0;
  }
  const env = { ...process.env, ...extraEnv } as Record<string, string>;
  const shell = process.platform === "win32";
  const r = spawnSync(bunExecutable(), ["run", "test"], {
    cwd: dir,
    stdio: "inherit",
    env,
    shell,
  });
  return r.status ?? 1;
}

/**
 * Fail-fast: run tests in stack dir then each cell package (`bun run test` if defined, else `bun test`).
 */
export function runTestCommand(cwdInput: string = cwd()): void {
  const workspaceRoot = findWorkspaceRoot(cwdInput);
  const stackRoot = findStackRoot(cwdInput);
  if (workspaceRoot == null || stackRoot == null) {
    console.error("Run `otavia test` from inside an Otavia workspace.");
    process.exit(1);
  }
  const fileEnv = loadEnvForCommand(stackRoot, "test");
  const merged = mergeProcessAndFileEnv(fileEnv);
  let model;
  try {
    model = buildStackModel({ stackRoot, workspaceRoot, env: merged });
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
  const dirs = collectStackAndCellDirs(stackRoot, model);
  for (const dir of dirs) {
    console.log(`[otavia test] ${dir}`);
    const code = runTestsInDir(dir, merged);
    if (code !== 0) process.exit(code);
  }
}
