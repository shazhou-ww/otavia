import { spawnSync } from "node:child_process";
import { cwd } from "node:process";
import { buildStackModel } from "@otavia/stack";
import { loadEnvForCommand } from "../env/load-env-for-command.js";
import { mergeProcessAndFileEnv } from "../env/merge-process-env.js";
import { findStackRoot } from "../resolve/find-stack-root.js";
import { findWorkspaceRoot } from "../resolve/find-workspace-root.js";

function spawnCloud(
  executable: string,
  args: string[],
  env: Record<string, string>
): { status: number | null } {
  return spawnSync(executable, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: env as NodeJS.ProcessEnv,
  });
}

/**
 * Run `aws sso login` or `az login` using stack `.env` / `.env.dev` (e.g. `AWS_PROFILE`, `AZURE_SUBSCRIPTION_ID`).
 */
export function runCloudLogin(cwdInput: string = cwd()): number {
  const workspaceRoot = findWorkspaceRoot(cwdInput);
  const stackRoot = findStackRoot(cwdInput);
  if (workspaceRoot == null || stackRoot == null) {
    console.error("Run `otavia cloud login` from inside an Otavia workspace (stack path).");
    return 1;
  }

  const fileEnv = loadEnvForCommand(stackRoot, "dev");
  const merged = mergeProcessAndFileEnv(fileEnv);

  let model;
  try {
    model = buildStackModel({ stackRoot, workspaceRoot, env: merged });
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    return 1;
  }

  if (model.cloud.provider === "aws") {
    const r = spawnCloud("aws", ["sso", "login"], merged);
    return r.status ?? 1;
  }

  const r = spawnCloud("az", ["login"], merged);
  if ((r.status ?? 1) !== 0) return r.status ?? 1;

  const sub = merged.AZURE_SUBSCRIPTION_ID?.trim();
  if (sub) {
    const r2 = spawnCloud("az", ["account", "set", "--subscription", sub], merged);
    return r2.status ?? 1;
  }
  return 0;
}

/**
 * Run `aws sso logout` or `az logout` with the same env as login.
 */
export function runCloudLogout(cwdInput: string = cwd()): number {
  const workspaceRoot = findWorkspaceRoot(cwdInput);
  const stackRoot = findStackRoot(cwdInput);
  if (workspaceRoot == null || stackRoot == null) {
    console.error("Run `otavia cloud logout` from inside an Otavia workspace (stack path).");
    return 1;
  }

  const fileEnv = loadEnvForCommand(stackRoot, "dev");
  const merged = mergeProcessAndFileEnv(fileEnv);

  let model;
  try {
    model = buildStackModel({ stackRoot, workspaceRoot, env: merged });
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    return 1;
  }

  if (model.cloud.provider === "aws") {
    const r = spawnCloud("aws", ["sso", "logout"], merged);
    return r.status ?? 1;
  }

  const r = spawnCloud("az", ["logout"], merged);
  return r.status ?? 1;
}
