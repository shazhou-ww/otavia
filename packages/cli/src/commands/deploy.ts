import type { DeployInput } from "@otavia/host-contract";
import type { StackModel } from "@otavia/stack";
import { buildStackModel } from "@otavia/stack";
import { cwd } from "node:process";
import { loadEnvForCommand } from "../env/load-env-for-command.js";
import { mergeProcessAndFileEnv } from "../env/merge-process-env.js";
import { createHostAdapterForCloud } from "../host/create-host-adapter.js";
import { findStackRoot } from "../resolve/find-stack-root.js";
import { findWorkspaceRoot } from "../resolve/find-workspace-root.js";

function tableLogicalIdToEnvSuffix(logicalTableId: string): string {
  return logicalTableId.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

export function deployInputFromStackModel(model: StackModel, stackRootAbs: string): DeployInput {
  const environments: Record<string, string> = {};
  for (const b of model.environments) {
    environments[b.envVarName] = model.topLevelVariableValues[b.logicalKey] ?? "";
  }
  const secrets: Record<string, unknown> = Object.fromEntries(
    model.secrets.map((s) => [s.secretName, { logicalKey: s.logicalKey }])
  );
  const region = model.cloud.region;
  const tables = model.resourceTables ?? {};
  const resourceTables =
    Object.keys(tables).length === 0
      ? undefined
      : Object.entries(tables).map(([logicalId, t]) => ({
          logicalId,
          partitionKeyAttr: t.partitionKey,
          rowKeyAttr: t.rowKey,
          envSuffix: tableLogicalIdToEnvSuffix(logicalId),
        }));
  return {
    stackRoot: stackRootAbs,
    stackName: model.name,
    provider: { region },
    environments,
    secrets,
    resourceTables,
  };
}

export async function runDeploy(cwdInput: string = cwd()): Promise<void> {
  const workspaceRoot = findWorkspaceRoot(cwdInput);
  const stackRoot = findStackRoot(cwdInput);
  if (workspaceRoot == null || stackRoot == null) {
    throw new Error("Run `otavia deploy` from inside an Otavia workspace.");
  }

  const fileEnv = loadEnvForCommand(stackRoot, "deploy");
  const env = mergeProcessAndFileEnv(fileEnv);
  const model = buildStackModel({ stackRoot, workspaceRoot, env });
  for (const w of model.warnings) {
    console.warn(`[otavia] ${w}`);
  }

  const host = createHostAdapterForCloud(model.cloud);
  await host.checkCredentials();

  const input = deployInputFromStackModel(model, stackRoot);

  await host.deployStack(input);
}
