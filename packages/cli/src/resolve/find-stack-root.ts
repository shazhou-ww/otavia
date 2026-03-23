import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { findWorkspaceRoot } from "./find-workspace-root.js";

const CONFIG_FILENAME = "otavia.yaml";

function isPathUnderOrEqual(workspaceRoot: string, dir: string): boolean {
  const rel = relative(resolve(workspaceRoot), resolve(dir));
  return rel === "" || !rel.startsWith("..");
}

/**
 * From `cwd`, walk toward the workspace root; return the **nearest** directory (closest to cwd)
 * that contains `otavia.yaml`, still inside the workspace. Returns null if not inside a workspace
 * or no `otavia.yaml` on the path (spec §7).
 */
export function findStackRoot(cwd: string): string | null {
  const workspaceRoot = findWorkspaceRoot(cwd);
  if (workspaceRoot == null) return null;

  let dir = resolve(cwd);
  const root = resolve(workspaceRoot);

  for (;;) {
    if (!isPathUnderOrEqual(root, dir)) {
      break;
    }
    if (existsSync(join(dir, CONFIG_FILENAME))) {
      return dir;
    }
    if (dir === root) {
      break;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return null;
}
