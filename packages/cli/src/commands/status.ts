import { existsSync, readFileSync } from "node:fs";
import { cwd } from "node:process";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildStackModel } from "@otavia/stack";
import type { StackModel } from "@otavia/stack";
import { loadEnvForCommand } from "../env/load-env-for-command.js";
import { mergeProcessAndFileEnv } from "../env/merge-process-env.js";
import { findStackRoot } from "../resolve/find-stack-root.js";
import { findWorkspaceRoot } from "../resolve/find-workspace-root.js";

function findCliVersion(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    const candidate = resolve(dir, "package.json");
    if (existsSync(candidate)) {
      try {
        const pkg = JSON.parse(readFileSync(candidate, "utf-8"));
        if (pkg.name === "@otavia/cli" && pkg.version) return pkg.version;
      } catch {}
    }
    dir = dirname(dir);
  }
  return "0.0.0";
}

export function formatStatusOutput(model: StackModel, stackRoot: string): string {
  const lines: string[] = [];
  lines.push(`Otavia CLI v${findCliVersion()}`);
  lines.push("");
  lines.push(`Stack:     ${model.name}`);
  lines.push(`Provider:  ${model.cloud.provider}`);
  lines.push(`Region:    ${model.cloud.region}`);
  lines.push("");

  const envPath = join(stackRoot, ".env");
  const envExists = existsSync(envPath);
  lines.push(`Env file:  ${envExists ? ".env found" : ".env missing"}`);
  lines.push("");

  if (model.cellMountOrder.length === 0) {
    lines.push("Cells:     (none)");
  } else {
    lines.push("Cells:");
    lines.push("");
    const header = "  Mount            Package                Backend   Frontend";
    lines.push(header);
    lines.push("  " + "-".repeat(header.trimStart().length));
    for (const mount of model.cellMountOrder) {
      const cell = model.cells[mount];
      if (!cell) continue;
      const m = mount.padEnd(16);
      const pkg = cell.packageName.padEnd(22);
      const be = cell.backend ? "yes" : "no";
      const fe = cell.frontend ? "yes" : "no";
      lines.push(`  ${m} ${pkg}  ${be.padEnd(9)} ${fe}`);
    }
  }

  return lines.join("\n");
}

export function runStatus(cwdInput: string = cwd()): void {
  const workspaceRoot = findWorkspaceRoot(cwdInput);
  const stackRoot = findStackRoot(cwdInput);
  if (workspaceRoot == null || stackRoot == null) {
    console.log(
      "Not inside an Otavia workspace.\n" +
        "Run this command from within a workspace directory (one containing package.json with workspaces and stacks/*/otavia.yaml)."
    );
    return;
  }

  const fileEnv = loadEnvForCommand(stackRoot, "dev");
  const env = mergeProcessAndFileEnv(fileEnv);

  let model: StackModel;
  try {
    model = buildStackModel({ stackRoot, workspaceRoot, env });
  } catch (e) {
    console.error(
      `Failed to build stack model: ${e instanceof Error ? e.message : String(e)}`
    );
    process.exit(1);
    return;
  }

  for (const w of model.warnings) {
    console.warn(`[otavia] ${w}`);
  }

  console.log(formatStatusOutput(model, stackRoot));
}
