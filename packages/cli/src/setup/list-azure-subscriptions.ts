import { spawn } from "node:child_process";

export type AzureSubscriptionChoice = {
  id: string;
  name: string;
  isDefault: boolean;
};

function runAzAccountListJson(): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("az", ["account", "list", "--output", "json"], {
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (c: string) => {
      stdout += c;
    });
    child.stderr?.on("data", (c: string) => {
      stderr += c;
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

/**
 * Subscriptions visible to the Azure CLI (after `az login`). Empty if `az` fails or JSON is invalid.
 */
export async function listAzureSubscriptions(): Promise<AzureSubscriptionChoice[]> {
  const r = await runAzAccountListJson();
  if (r.exitCode !== 0) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const rows: AzureSubscriptionChoice[] = [];
  for (const item of parsed) {
    if (item === null || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === "string" ? rec.id : "";
    const name = typeof rec.name === "string" ? rec.name : "";
    if (id === "") continue;
    rows.push({
      id,
      name: name || id,
      isDefault: rec.isDefault === true,
    });
  }
  rows.sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return rows;
}
