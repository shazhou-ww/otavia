import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const COMMAND_FILE = {
  dev: ".env.dev",
  test: ".env.test",
  deploy: ".env.deploy",
} as const;

/**
 * Minimal `.env` line parser (KEY=VALUE). Ignores blank lines and `#` comments.
 * Does not implement full dotenv edge cases (exports, multiline, etc.).
 */
export function parseDotenvContent(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (key === "") continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Load env files for the current Otavia command (spec §6.3).
 * Order: `.env` then `.env.dev` | `.env.test` | `.env.deploy`; later file overrides.
 * Missing files are skipped.
 */
export function loadEnvForCommand(
  stackRoot: string,
  command: "dev" | "test" | "deploy"
): Record<string, string> {
  let merged: Record<string, string> = {};

  const basePath = join(stackRoot, ".env");
  if (existsSync(basePath)) {
    merged = { ...merged, ...parseDotenvContent(readFileSync(basePath, "utf-8")) };
  }

  const extraPath = join(stackRoot, COMMAND_FILE[command]);
  if (existsSync(extraPath)) {
    merged = { ...merged, ...parseDotenvContent(readFileSync(extraPath, "utf-8")) };
  }

  return merged;
}
