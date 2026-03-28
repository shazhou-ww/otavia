import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** `packages/cli` root (directory containing `package.json`). */
export function getCliPackageRoot(): string {
  // Walk up from the current file until we find package.json
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    if (existsSync(resolve(dir, "package.json"))) return dir;
    dir = resolve(dir, "..");
  }
  // Fallback: assume bundled in dist/, go up one level
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}
