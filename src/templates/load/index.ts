import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getOtaviaPackageRoot } from "../resolve-package-root";

const PLACEHOLDER = /\{\{([a-zA-Z0-9_]+)\}\}/g;

/** Read a file under `assets/templates/` (path relative to that folder, use `/` segments). */
export function loadTemplate(relPath: string): string {
  const normalized = relPath.replace(/\\/g, "/").replace(/^\//, "");
  const full = join(getOtaviaPackageRoot(), "assets", "templates", ...normalized.split("/"));
  return readFileSync(full, "utf-8");
}

/** Replace `{{key}}` placeholders; throws if any key is missing. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(PLACEHOLDER, (_, key: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) return vars[key]!;
    throw new Error(`Missing template variable: ${key}`);
  });
}

export function loadRenderedTemplate(relPath: string, vars: Record<string, string>): string {
  return renderTemplate(loadTemplate(relPath), vars);
}
