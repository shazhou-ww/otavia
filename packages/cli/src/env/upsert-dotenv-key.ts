import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

/**
 * Format a value for a single-line KEY=VALUE in `.env` (minimal quoting).
 */
export function formatDotenvValue(value: string): string {
  if (value === "") return '""';
  if (/[\s#'"]/.test(value) || value.includes("=")) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

function escapeKeyForRegex(key: string): string {
  return key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Set or replace `key` in `envFilePath`, preserving unrelated lines. Creates the file if missing.
 */
export async function upsertDotenvKey(envFilePath: string, key: string, value: string): Promise<void> {
  const line = `${key}=${formatDotenvValue(value)}`;
  const re = new RegExp(`^${escapeKeyForRegex(key)}=.*$`, "m");
  if (!existsSync(envFilePath)) {
    await writeFile(envFilePath, `${line}\n`, "utf8");
    return;
  }
  let raw = await readFile(envFilePath, "utf8");
  if (re.test(raw)) {
    raw = raw.replace(re, line);
  } else {
    const sep = raw.endsWith("\n") ? "" : "\n";
    raw = `${raw}${sep}${line}\n`;
  }
  await writeFile(envFilePath, raw, "utf8");
}
