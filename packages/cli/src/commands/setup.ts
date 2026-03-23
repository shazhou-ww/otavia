import { constants } from "node:fs";
import { access, copyFile } from "node:fs/promises";
import { cwd } from "node:process";
import { join } from "node:path";
import { buildStackModel } from "@otavia/stack";
import { loadEnvForCommand } from "../env/load-env-for-command.js";
import { mergeProcessAndFileEnv } from "../env/merge-process-env.js";
import { createHostAdapterForProvider } from "../host/create-host-adapter.js";
import { findStackRoot } from "../resolve/find-stack-root.js";
import { findWorkspaceRoot } from "../resolve/find-workspace-root.js";

/**
 * If `.env.example` exists and `.env` does not, copy example → `.env` (legacy-style onboarding).
 */
export async function copyEnvExampleIfMissing(workspaceRoot: string): Promise<boolean> {
  const example = join(workspaceRoot, ".env.example");
  const envPath = join(workspaceRoot, ".env");
  try {
    await access(example, constants.F_OK);
  } catch {
    return false;
  }
  try {
    await access(envPath, constants.F_OK);
    return false;
  } catch {
    await copyFile(example, envPath);
    return true;
  }
}

/**
 * `setup`: env bootstrap, `buildStackModel` (spec §6.2 incl. param keys), host toolchain check.
 * Uses the same `.env` / `.env.dev` chain as `dev` for the workspace root (plan Task 18).
 */
export async function runSetup(cwdInput: string = cwd()): Promise<void> {
  const workspaceRoot = findWorkspaceRoot(cwdInput);
  const stackRoot = findStackRoot(cwdInput);
  if (workspaceRoot == null || stackRoot == null) {
    throw new Error(
      "Run `otavia setup` from inside an Otavia workspace (workspace package.json + stacks/*/otavia.yaml on path to cwd)."
    );
  }

  await copyEnvExampleIfMissing(workspaceRoot);

  const fileEnv = loadEnvForCommand(workspaceRoot, "dev");
  const env = mergeProcessAndFileEnv(fileEnv);

  const model = buildStackModel({ stackRoot, workspaceRoot, env });
  for (const w of model.warnings) {
    console.warn(`[otavia] ${w}`);
  }

  const host = createHostAdapterForProvider(model.provider);
  if (process.env.OTAVIA_SETUP_SKIP_TOOLCHAIN === "1") {
    return;
  }
  await host.checkToolchain();
}
