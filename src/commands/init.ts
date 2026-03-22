import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { loadOtaviaYaml } from "../config/load-otavia-yaml.js";

const DEFAULT_MOUNT = "app";

function yamlScalar(s: string): string {
  if (/^[\w.-]+$/.test(s)) return s;
  return JSON.stringify(s);
}

function mergeGitignore(root: string): void {
  const lines = ["node_modules/", "dist/", ".otavia/", ".env.local"];
  const p = resolve(root, ".gitignore");
  if (!existsSync(p)) {
    writeFileSync(p, `${lines.join("\n")}\n`, "utf-8");
    return;
  }
  const existing = readFileSync(p, "utf-8");
  const missing = lines.filter((line) => !existing.split("\n").some((l) => l.trim() === line.trim()));
  if (missing.length === 0) return;
  appendFileSync(p, `${existing.endsWith("\n") ? "" : "\n"}${missing.join("\n")}\n`, "utf-8");
}

/**
 * Scaffold a new Otavia stack: otavia.yaml, cells/<defaultMount>/cell.yaml, and optional .gitignore entries.
 */
export function initCommand(
  rootDir: string,
  options: { force?: boolean; stackName?: string; domain?: string }
): void {
  const root = resolve(rootDir);
  const configPath = resolve(root, "otavia.yaml");

  if (existsSync(configPath) && !options.force) {
    throw new Error("otavia.yaml already exists. Use --force to overwrite.");
  }

  const stackName =
    options.stackName?.trim() ||
    basename(root).replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-|-$/g, "").toLowerCase() ||
    "my-stack";
  const domainHost = options.domain?.trim() || "example.com";

  const yamlContent = `# Otavia stack — edit stackName, domain, and cells.
stackName: ${yamlScalar(stackName)}
domain:
  host: ${yamlScalar(domainHost)}
cells:
  ${DEFAULT_MOUNT}: "@otavia/${DEFAULT_MOUNT}"
`;

  writeFileSync(configPath, yamlContent, "utf-8");

  const cellDir = resolve(root, "cells", DEFAULT_MOUNT);
  mkdirSync(cellDir, { recursive: true });
  const cellYamlPath = resolve(cellDir, "cell.yaml");
  if (!existsSync(cellYamlPath) || options.force) {
    writeFileSync(cellYamlPath, `name: ${DEFAULT_MOUNT}\n`, "utf-8");
  }

  mergeGitignore(root);

  loadOtaviaYaml(root);

  console.log(`Initialized Otavia stack in ${root}`);
  console.log(`  ${configPath}`);
  console.log(`  ${cellYamlPath}`);
}
