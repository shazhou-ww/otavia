import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

function packageJsonDeclaresWorkspaces(pkg: unknown): boolean {
  if (pkg == null || typeof pkg !== "object") return false;
  const w = (pkg as Record<string, unknown>).workspaces;
  if (w == null) return false;
  if (Array.isArray(w)) return w.length > 0;
  if (typeof w === "object" && w !== null) {
    const packages = (w as { packages?: unknown }).packages;
    return Array.isArray(packages) && packages.length > 0;
  }
  return false;
}

/**
 * Walk upward from `cwd`; return the first directory whose `package.json` declares Bun/npm `workspaces`.
 * Matches spec §7 workspace root rule.
 */
export function findWorkspaceRoot(cwd: string): string | null {
  let dir = resolve(cwd);
  for (;;) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as unknown;
        if (packageJsonDeclaresWorkspaces(pkg)) {
          return dir;
        }
      } catch {
        // ignore invalid package.json
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
