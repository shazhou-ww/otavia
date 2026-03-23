import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { cwd } from "node:process";
import { buildStackModel } from "@otavia/stack";
import { bunExecutable } from "../utils/bun-executable.js";
import { findStackRoot } from "../resolve/find-stack-root.js";
import { findWorkspaceRoot } from "../resolve/find-workspace-root.js";
import { collectStackAndCellDirs } from "./collect-workspace-dirs.js";

/**
 * Fail-fast: `biome check` on workspace root, stack dir, and each cell dir (skips if no `biome.json` at workspace root).
 */
export function runLintCommand(cwdInput: string = cwd()): void {
  const workspaceRoot = findWorkspaceRoot(cwdInput);
  const stackRoot = findStackRoot(cwdInput);
  if (workspaceRoot == null || stackRoot == null) {
    console.error("Run `otavia lint` from inside an Otavia workspace.");
    process.exit(1);
  }
  if (!existsSync(join(workspaceRoot, "biome.json"))) {
    console.warn("[otavia lint] No biome.json at workspace root; nothing to do.");
    return;
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
  const dirs = [workspaceRoot, ...collectStackAndCellDirs(stackRoot, model).filter((d) => d !== workspaceRoot)];
  const unique = [...new Set(dirs)];
  const shell = process.platform === "win32";
  for (const dir of unique) {
    console.log(`[otavia lint] ${dir}`);
    const r = spawnSync(bunExecutable(), ["x", "biome", "check", dir], {
      cwd: workspaceRoot,
      stdio: "inherit",
      shell,
    });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
}
