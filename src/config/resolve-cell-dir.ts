import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Resolve cell package root directory from project root by package name (e.g. @otavia/sso) or mount slug.
 *
 * **Default layout:** `cells/<name>/cell.yaml` (name = mount or last segment of package name).
 * For scoped packages, `cells/<slug>` is checked before `apps/<slug>` and before `node_modules`.
 */
export function resolveCellDir(rootDir: string, packageOrMount: string): string {
  const isPackageName = packageOrMount.includes("/") || packageOrMount.startsWith("@");
  if (isPackageName) {
    const slug = packageOrMount.split("/").pop() ?? packageOrMount;
    const cellsSlug = resolve(rootDir, "cells", slug);
    if (existsSync(resolve(cellsSlug, "cell.yaml"))) return cellsSlug;
    const appsSlug = resolve(rootDir, "apps", slug);
    if (existsSync(resolve(appsSlug, "cell.yaml"))) return appsSlug;
    const dir = resolveCellDirByPackage(rootDir, packageOrMount);
    if (dir) return dir;
    return cellsSlug;
  }
  const cellsSubdir = resolve(rootDir, "cells", packageOrMount);
  if (existsSync(resolve(cellsSubdir, "cell.yaml"))) {
    return cellsSubdir;
  }
  const appsSubdir = resolve(rootDir, "apps", packageOrMount);
  if (existsSync(resolve(appsSubdir, "cell.yaml"))) {
    return appsSubdir;
  }
  const sibling = resolve(rootDir, "..", packageOrMount);
  if (existsSync(resolve(sibling, "cell.yaml"))) {
    return sibling;
  }
  return cellsSubdir;
}

/**
 * Find package root (directory containing cell.yaml) by walking node_modules from rootDir upward.
 */
function resolveCellDirByPackage(rootDir: string, packageName: string): string | null {
  let dir = resolve(rootDir);
  const parts = packageName.split("/");
  const pkgPath = parts.length === 2 && packageName.startsWith("@")
    ? `${parts[0]}/${parts[1]}`
    : parts[0];
  while (dir !== resolve(dir, "..")) {
    const candidate = resolve(dir, "node_modules", pkgPath);
    const cellYaml = resolve(candidate, "cell.yaml");
    if (existsSync(cellYaml)) {
      return candidate;
    }
    dir = resolve(dir, "..");
  }
  return null;
}
