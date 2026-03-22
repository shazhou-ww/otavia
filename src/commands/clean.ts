import fs from "node:fs";
import path from "node:path";
import { loadOtaviaYamlAt } from "../config/load-otavia-yaml.js";
import { resolveOtaviaWorkspacePaths } from "../config/resolve-otavia-workspace.js";
import { resolveCellDir } from "../config/resolve-cell-dir.js";

function removeDirIfExists(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

/**
 * Clean command: remove temp dirs (.cell, .esbuild, .otavia) from root and from each cell directory.
 * Does NOT delete .env or .env.local.
 */
export function cleanCommand(rootDir: string): void {
  const { monorepoRoot, configDir } = resolveOtaviaWorkspacePaths(rootDir);
  const otavia = loadOtaviaYamlAt(configDir);

  // App-level temp dirs (under directory that contains otavia.yaml)
  removeDirIfExists(path.join(configDir, ".cell"));
  removeDirIfExists(path.join(configDir, ".esbuild"));
  removeDirIfExists(path.join(configDir, ".otavia"));

  // Per-cell temp dirs
  for (const entry of otavia.cellsList) {
    const cellDir = resolveCellDir(monorepoRoot, entry.package);
    removeDirIfExists(path.join(cellDir, ".cell"));
    removeDirIfExists(path.join(cellDir, ".esbuild"));
  }

  console.log("Cleaned .cell, .esbuild, .otavia");
}
