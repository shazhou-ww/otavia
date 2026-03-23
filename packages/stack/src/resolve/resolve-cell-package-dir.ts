import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * Resolve a workspace cell package directory from the stack package root
 * (directory containing that stack's `package.json`).
 */
export function resolveCellPackageDir(stackPackageRoot: string, packageName: string): string {
  const req = createRequire(join(stackPackageRoot, "package.json"));
  try {
    const pkgJson = req.resolve(join(packageName, "package.json"));
    return dirname(pkgJson);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Failed to resolve cell package "${packageName}" from stack root "${stackPackageRoot}": ${msg}`
    );
  }
}
