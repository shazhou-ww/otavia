import { constants } from "node:fs";
import { access, copyFile } from "node:fs/promises";
import { cwd } from "node:process";
import { join } from "node:path";
import { buildStackModel } from "@otavia/stack";
import { loadEnvForCommand } from "../env/load-env-for-command.js";
import { mergeProcessAndFileEnv } from "../env/merge-process-env.js";
import { createHostAdapterForCloud } from "../host/create-host-adapter.js";
import { findStackRoot } from "../resolve/find-stack-root.js";
import { findWorkspaceRoot } from "../resolve/find-workspace-root.js";
import { promptAndWriteCloudIdentity } from "../setup/prompt-cloud-identity.js";

/**
 * If `stackRoot/.env.example` exists and `stackRoot/.env` does not, copy example → `.env`.
 */
export async function copyEnvExampleIfMissing(stackRoot: string): Promise<boolean> {
  const example = join(stackRoot, ".env.example");
  const envPath = join(stackRoot, ".env");
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
 * Uses the same `.env` / `.env.dev` chain as `dev` under **stack root** (`stacks/<name>/`).
 * When stdin is a TTY, prompts once to set `AWS_PROFILE` (AWS) in the stack `.env`.
 * Skip with `OTAVIA_SETUP_SKIP_CLOUD_IDENTITY=1` or non-interactive stdin.
 */
export async function runSetup(cwdInput: string = cwd()): Promise<void> {
  const workspaceRoot = findWorkspaceRoot(cwdInput);
  const stackRoot = findStackRoot(cwdInput);
  if (workspaceRoot == null || stackRoot == null) {
    throw new Error(
      "Run `otavia setup` from inside an Otavia workspace (workspace package.json + stacks/*/otavia.yaml on path to cwd)."
    );
  }

  await copyEnvExampleIfMissing(stackRoot);

  const fileEnv = loadEnvForCommand(stackRoot, "dev");
  const env = mergeProcessAndFileEnv(fileEnv);

  const model = buildStackModel({ stackRoot, workspaceRoot, env });
  for (const w of model.warnings) {
    console.warn(`[otavia] ${w}`);
  }

  await promptAndWriteCloudIdentity(stackRoot);

  const host = createHostAdapterForCloud(model.cloud);
  if (process.env.OTAVIA_SETUP_SKIP_TOOLCHAIN === "1") {
    return;
  }
  await host.checkToolchain();
}
