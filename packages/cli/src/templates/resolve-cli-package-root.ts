import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** `packages/cli` root (directory containing `package.json`). */
export function getCliPackageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}
