import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

let cached: string | undefined;

/** Version from `@otavia/cli-legacy` package.json (same as published npm version when installed from registry). */
export function getOtaviaPackageVersion(): string {
  if (cached != null) return cached;
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const pkgPath = resolve(dir, "../package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string };
    cached = pkg.version?.trim() || "0.0.0";
  } catch {
    cached = "0.0.0";
  }
  return cached;
}
