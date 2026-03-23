import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DeployInput } from "@otavia/host-contract";
import type { CommandRunner } from "../command-runner.js";
import { buildMinimalFunctionBicep } from "../template/minimal-function.bicep.js";

export function sanitizeAzureDeploymentName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const out = base.length > 0 ? base : "otavia-deploy";
  return out.slice(0, 60);
}

/**
 * Writes `stackRoot/.otavia/azure/main.bicep` + parameter JSON and runs `az deployment group create`.
 */
export async function deployAzureStack(input: DeployInput, run: CommandRunner): Promise<void> {
  const location = input.provider.location?.trim();
  if (!location) {
    throw new Error("Azure deploy requires provider.location");
  }
  const resourceGroup = input.resourceGroup?.trim();
  if (!resourceGroup) {
    throw new Error("Azure deploy requires DeployInput.resourceGroup");
  }

  if (input.secrets != null && typeof input.secrets === "object" && !Array.isArray(input.secrets)) {
    const keys = Object.keys(input.secrets as Record<string, unknown>);
    if (keys.length > 0) {
      console.warn(
        `[otavia host-azure] DeployInput.secrets (${keys.length} keys): Key Vault mapping is not implemented; bindings are ignored.`
      );
    }
  }

  const dir = join(input.stackRoot, ".otavia", "azure");
  await mkdir(dir, { recursive: true });
  const bicepPath = join(dir, "main.bicep");
  const hasTables = (input.resourceTables?.length ?? 0) > 0;
  await writeFile(
    bicepPath,
    buildMinimalFunctionBicep({ resourceTables: input.resourceTables }),
    "utf8"
  );

  const paramsPath = join(dir, "deploy-params.json");
  const paramsDoc: Record<string, { value: unknown }> = {
    location: { value: location },
    stackName: { value: input.stackName },
    envSettings: { value: input.environments },
  };
  if (hasTables) {
    paramsDoc.resourceTables = { value: input.resourceTables };
  }
  await writeFile(paramsPath, `${JSON.stringify(paramsDoc, null, 2)}\n`, "utf8");

  const deploymentName = sanitizeAzureDeploymentName(`${input.stackName}-deploy`);
  const r = await run("az", [
    "deployment",
    "group",
    "create",
    "--resource-group",
    resourceGroup,
    "--name",
    deploymentName,
    "--template-file",
    bicepPath,
    "--parameters",
    `@${paramsPath}`,
  ]);
  if (r.exitCode !== 0) {
    const detail = (r.stderr || r.stdout).trim() || `exit ${r.exitCode}`;
    throw new Error(`az deployment group create failed: ${detail}`);
  }
}
