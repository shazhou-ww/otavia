import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { cwd } from "node:process";
import { buildStackModel } from "@otavia/stack";
import { bunExecutable } from "../utils/bun-executable.js";
import { findStackRoot } from "../resolve/find-stack-root.js";
import { findWorkspaceRoot } from "../resolve/find-workspace-root.js";
import { collectStackAndCellDirs } from "./collect-workspace-dirs.js";

function runTypecheckInDir(dir: string): number {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) return 0;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { scripts?: { typecheck?: string } };
  if (!pkg.scripts?.typecheck) {
    console.log(`[otavia typecheck] skip (no typecheck script): ${dir}`);
    return 0;
  }
  const r = spawnSync(bunExecutable(), ["run", "typecheck"], {
    cwd: dir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return r.status ?? 1;
}

/**
 * Fail-fast: `bun run typecheck` in stack and cell packages when the script exists.
 */
export function runTypecheckCommand(cwdInput: string = cwd()): void {
  const workspaceRoot = findWorkspaceRoot(cwdInput);
  const stackRoot = findStackRoot(cwdInput);
  if (workspaceRoot == null || stackRoot == null) {
    console.error("Run `otavia typecheck` from inside an Otavia workspace.");
    process.exit(1);
  }
  let model;
  try {
    model = buildStackModel({
      stackRoot,
      workspaceRoot,
      env: { ...process.env } as Record<string, string>,
    });
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
  const dirs = collectStackAndCellDirs(stackRoot, model);
  for (const dir of dirs) {
    console.log(`[otavia typecheck] ${dir}`);
    const code = runTypecheckInDir(dir);
    if (code !== 0) process.exit(code);
  }
}
