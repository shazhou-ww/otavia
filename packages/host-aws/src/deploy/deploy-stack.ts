import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DeployInput } from "@otavia/host-contract";
import type { CommandRunner } from "../command-runner.js";
import { buildMinimalHttpLambdaTemplate } from "../template/minimal-http-lambda.js";

export function sanitizeCloudFormationStackName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const out = base.length > 0 ? base : "otavia-stack";
  return out.slice(0, 128);
}

/**
 * Writes `stackRoot/.otavia/aws/template.yaml` and runs `aws cloudformation deploy`.
 */
export async function deployAwsStack(input: DeployInput, run: CommandRunner): Promise<void> {
  const region = input.provider.region?.trim();
  if (!region) {
    throw new Error("AWS deploy requires provider.region");
  }

  if (input.secrets != null && typeof input.secrets === "object" && !Array.isArray(input.secrets)) {
    const keys = Object.keys(input.secrets as Record<string, unknown>);
    if (keys.length > 0) {
      console.warn(
        `[otavia host-aws] DeployInput.secrets (${keys.length} keys): SSM mapping is not implemented; bindings are ignored.`
      );
    }
  }

  const yaml = buildMinimalHttpLambdaTemplate({
    environments: input.environments,
    resourceTables: input.resourceTables,
  });
  const dir = join(input.stackRoot, ".otavia", "aws");
  await mkdir(dir, { recursive: true });
  const templatePath = join(dir, "template.yaml");
  await writeFile(templatePath, yaml, "utf8");

  const stackName = sanitizeCloudFormationStackName(input.stackName);
  const r = await run("aws", [
    "cloudformation",
    "deploy",
    "--stack-name",
    stackName,
    "--template-file",
    templatePath,
    "--capabilities",
    "CAPABILITY_NAMED_IAM",
    "--region",
    region,
    "--no-fail-on-empty-changeset",
  ]);
  if (r.exitCode !== 0) {
    const detail = (r.stderr || r.stdout).trim() || `exit ${r.exitCode}`;
    throw new Error(`aws cloudformation deploy failed: ${detail}`);
  }
}
