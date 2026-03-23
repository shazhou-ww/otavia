import { basename, resolve } from "node:path";

/**
 * Normalize user input to an npm scope with a leading `@` (e.g. `acme` or `@acme` → `@acme`).
 */
export function normalizePackageScope(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Package scope is empty");
  }
  const body = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  const cleaned = body
    .replace(/[^a-zA-Z0-9-_.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  if (!cleaned || !/^[a-z0-9]/.test(cleaned)) {
    throw new Error(`Invalid package scope: ${raw}. Use a name like "acme" or "@acme".`);
  }
  return `@${cleaned}`;
}

/** Default scope from the directory name (e.g. mcp-hub → @mcp-hub). */
export function defaultPackageScopeFromDir(rootDir: string): string {
  const base = basename(resolve(rootDir))
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return normalizePackageScope(base || "project");
}

/** Scoped package name: `@org/slug` (slug is usually `main` or a cell mount). */
export function scopedPackageName(scope: string, slug: string): string {
  const s = normalizePackageScope(scope);
  const org = s.slice(1);
  if (!slug.trim()) {
    throw new Error("Package name segment is empty");
  }
  return `@${org}/${slug}`;
}
