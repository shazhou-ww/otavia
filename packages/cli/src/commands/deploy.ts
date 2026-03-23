import type { DeployInput } from "@otavia/host-contract";
import type { StackModel } from "@otavia/stack";
import { buildStackModel } from "@otavia/stack";
import { cwd } from "node:process";
import { loadEnvForCommand } from "../env/load-env-for-command.js";
import { mergeProcessAndFileEnv } from "../env/merge-process-env.js";
import { createHostAdapterForProvider } from "../host/create-host-adapter.js";
import { findStackRoot } from "../resolve/find-stack-root.js";
import { findWorkspaceRoot } from "../resolve/find-workspace-root.js";

export function deployInputFromStackModel(model: StackModel, stackRootAbs: string): DeployInput {
  const environments: Record<string, string> = {};
  for (const b of model.environments) {
    environments[b.envVarName] = model.topLevelVariableValues[b.logicalKey] ?? "";
  }
  const secrets: Record<string, unknown> = Object.fromEntries(
    model.secrets.map((s) => [s.secretName, { logicalKey: s.logicalKey }])
  );
  const region =
    typeof model.provider.region === "string" ? model.provider.region : undefined;
  const location =
    typeof model.provider.location === "string" ? model.provider.location : undefined;
  return {
    stackRoot: stackRootAbs,
    stackName: model.name,
    provider: { region, location },
    environments,
    secrets,
    resourceGroup: process.env.OTAVIA_AZURE_RESOURCE_GROUP,
  };
}

export async function runDeploy(cwdInput: string = cwd()): Promise<void> {
  const workspaceRoot = findWorkspaceRoot(cwdInput);
  const stackRoot = findStackRoot(cwdInput);
  if (workspaceRoot == null || stackRoot == null) {
    throw new Error("Run `otavia deploy` from inside an Otavia workspace.");
  }

  const fileEnv = loadEnvForCommand(workspaceRoot, "deploy");
  const env = mergeProcessAndFileEnv(fileEnv);
  const model = buildStackModel({ stackRoot, workspaceRoot, env });
  for (const w of model.warnings) {
    console.warn(`[otavia] ${w}`);
  }

  const host = createHostAdapterForProvider(model.provider);
  await host.checkCredentials();

  const input = deployInputFromStackModel(model, stackRoot);
  if (host.providerId === "azure" && (input.resourceGroup == null || input.resourceGroup.trim() === "")) {
    throw new Error("Azure deploy requires OTAVIA_AZURE_RESOURCE_GROUP in the environment.");
  }

  await host.deployStack(input);
}
