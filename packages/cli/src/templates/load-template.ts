import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getCliPackageRoot } from "./resolve-cli-package-root.js";

const PLACEHOLDER = /\{\{([a-zA-Z0-9_]+)\}\}/g;

export function loadTemplate(relPath: string): string {
  const normalized = relPath.replace(/\\/g, "/").replace(/^\//, "");
  const full = join(getCliPackageRoot(), "assets", "templates", ...normalized.split("/"));
  return readFileSync(full, "utf-8");
}

export function loadRenderedTemplate(relPath: string, vars: Record<string, string>): string {
  const template = loadTemplate(relPath);
  return template.replace(PLACEHOLDER, (_, key: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) return vars[key]!;
    throw new Error(`Missing template variable: ${key}`);
  });
}
