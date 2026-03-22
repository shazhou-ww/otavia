import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import { loadOtaviaYaml } from "../config/load-otavia-yaml.js";
import { resolveCellDir } from "../config/resolve-cell-dir.js";

export function listCellsCommand(rootDir: string): void {
  const root = resolve(rootDir);
  const otavia = loadOtaviaYaml(root);
  const rows: { mount: string; packageName: string; path: string; ok: boolean }[] = [];

  for (const cell of otavia.cellsList) {
    const dir = resolveCellDir(root, cell.package);
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
    const rel = relative(root, r.path) || ".";
    const suffix = r.ok ? "" : "  (no cell.yaml)";
    console.log(`${r.mount.padEnd(mountW)}  ${r.packageName.padEnd(pkgW)}  ${rel}${suffix}`);
  }
}
