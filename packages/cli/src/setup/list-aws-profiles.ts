import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseAwsConfigProfiles } from "./parse-aws-config-profiles.js";

/**
 * Resolves `~/.aws/config` unless `AWS_CONFIG_FILE` is set (same semantics as AWS CLI).
 */
export function resolveAwsConfigPath(): string {
  const fromEnv = process.env.AWS_CONFIG_FILE?.trim();
  if (fromEnv) return fromEnv;
  return join(homedir(), ".aws", "config");
}

export async function listAwsProfileNames(): Promise<string[]> {
  try {
    const content = await readFile(resolveAwsConfigPath(), "utf8");
    return parseAwsConfigProfiles(content);
  } catch {
    return [];
  }
}
