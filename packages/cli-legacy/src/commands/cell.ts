import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseDocument } from "yaml";
import type { OtaviaYaml } from "../config/otavia-yaml-schema";
import { loadOtaviaYamlAt } from "../config/load-otavia-yaml";
import { resolveOtaviaWorkspacePaths } from "../config/resolve-otavia-workspace";
import { resolveCellDir } from "../config/resolve-cell-dir";
import { normalizePackageScope, scopedPackageName } from "../utils/package-scope";
import { scaffoldCellFiles, validateCellMount } from "./cell-scaffold";

function inferScopeFromOtavia(otavia: OtaviaYaml): string {
  const pkg = otavia.cellsList[0]?.package?.trim();
  if (!pkg) {
    throw new Error(
      'Cannot infer package scope: otavia.yaml has no cells. Pass --scope (e.g. acme or "@acme").'
    );
  }
  const parts = pkg.split("/");
  if (!pkg.startsWith("@") || parts.length < 2 || !parts[0].startsWith("@")) {
    throw new Error(`Cannot infer scope from package "${pkg}". Pass --scope.`);
  }
  return normalizePackageScope(parts[0]);
}

function appendCellToOtaviaYaml(configDir: string, mount: string, packageName: string): void {
  const configPath = join(configDir, "otavia.yaml");
  const raw = readFileSync(configPath, "utf-8");
  const doc = parseDocument(raw);
  if (doc.errors.length > 0) {
    throw new Error(`Failed to parse otavia.yaml: ${doc.errors.map((e) => e.message).join("; ")}`);
  }
  if (!doc.hasIn(["cells"])) {
    throw new Error("otavia.yaml: missing cells mapping");
  }
  const existing = doc.getIn(["cells", mount]);
  if (existing != null) {
    throw new Error(
      `otavia.yaml already declares cells.${mount}. Remove it first or use a different mount.`
    );
  }
  doc.setIn(["cells", mount], packageName);
  writeFileSync(configPath, doc.toString(), "utf-8");
}

/**
 * Create `cells/<mount>/` from templates and append `cells.<mount>` in otavia.yaml.
 */
export function createCellCommand(
  rootDir: string,
  mountArg: string,
  options: { force?: boolean; scope?: string }
): void {
  const mount = validateCellMount(mountArg);
  const { monorepoRoot, configDir } = resolveOtaviaWorkspacePaths(rootDir);
  const otavia = loadOtaviaYamlAt(configDir);

  const taken = new Set(otavia.cellsList.map((c) => c.mount));
  if (taken.has(mount)) {
    throw new Error(`Cell mount "${mount}" is already registered in otavia.yaml.`);
  }

  const scope = options.scope?.trim()
    ? normalizePackageScope(options.scope)
    : inferScopeFromOtavia(otavia);
  const cellPkg = scopedPackageName(scope, mount);

  scaffoldCellFiles(monorepoRoot, mount, cellPkg, { force: options.force ?? false });
  appendCellToOtaviaYaml(configDir, mount, cellPkg);

  console.log(`Created cell "${mount}" at cells/${mount} (${cellPkg}).`);
  console.log("Next: bun install, then otavia cell list or bun run dev.");
}

export function listCellsCommand(rootDir: string): void {
  const { monorepoRoot, configDir } = resolveOtaviaWorkspacePaths(rootDir);
  const otavia = loadOtaviaYamlAt(configDir);
  const rows: { mount: string; packageName: string; path: string; ok: boolean }[] = [];

  for (const cell of otavia.cellsList) {
    const dir = resolveCellDir(monorepoRoot, cell.package);
    const cellYaml = resolve(dir, "cell.yaml");
    rows.push({
      mount: cell.mount,
      packageName: cell.package,
      path: dir,
      ok: existsSync(cellYaml),
    });
  }

  const mountW = Math.max(5, ...rows.map((r) => r.mount.length), "mount".length);
  const pkgW = Math.max(8, ...rows.map((r) => r.packageName.length), "package".length);

  console.log(
    `${"mount".padEnd(mountW)}  ${"package".padEnd(pkgW)}  path`
  );
  for (const r of rows) {
    const rel = relative(monorepoRoot, r.path) || ".";
    const suffix = r.ok ? "" : "  (no cell.yaml)";
    console.log(`${r.mount.padEnd(mountW)}  ${r.packageName.padEnd(pkgW)}  ${rel}${suffix}`);
  }
}
