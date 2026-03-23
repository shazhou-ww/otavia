#!/usr/bin/env bun
import { OtaviaCredentialUserError } from "@otavia/host-contract";
import { stdin as input } from "node:process";
import { Command } from "commander";
import { runInit } from "./commands/init.js";
import { runCloudLogin, runCloudLogout } from "./commands/cloud.js";
import { runDeploy } from "./commands/deploy.js";
import { runDev } from "./commands/dev.js";
import { runLintCommand } from "./commands/lint.js";
import { runSetup } from "./commands/setup.js";
import { runTestCommand } from "./commands/test.js";
import { runTypecheckCommand } from "./commands/typecheck.js";
import { createHostAdapterForCloud } from "./host/create-host-adapter.js";
import { promptCloudProvider } from "./prompt-cloud-provider.js";

const program = new Command();

program.name("otavia").version("0.0.1");

program
  .command("init")
  .description("Create a new Otavia workspace (stacks + cells)")
  .argument("[directory]", "empty target directory", ".")
  .option("--provider <id>", 'cloud: "aws" or "azure" (omit to prompt interactively)')
  .option(
    "--use-global-otavia",
    "omit stacks/main devDependencies @otavia/cli (avoids install failure when the package is unpublished); scripts use `otavia` on PATH — use `bun link --global` in packages/cli or a global install"
  )
  .action(async (directory: string, opts: { provider?: string; useGlobalOtavia?: boolean }) => {
    let p = opts.provider?.trim();
    if (p === "") p = undefined;
    if (p != null && p !== "aws" && p !== "azure") {
      throw new Error('Invalid --provider: use "aws" or "azure"');
    }
    let provider: "aws" | "azure";
    if (p != null) {
      provider = p;
    } else if (input.isTTY) {
      provider = await promptCloudProvider();
    } else {
      throw new Error('Non-interactive init: pass --provider aws or --provider azure');
    }
    await runInit(directory, { provider, useGlobalOtavia: opts.useGlobalOtavia === true });
  });

program
  .command("setup")
  .description(
    "Bootstrap env files, validate stack model, check cloud CLI; interactive TTY prompts for AWS_PROFILE or AZURE_SUBSCRIPTION_ID"
  )
  .action(async () => {
    await runSetup();
  });

const cloud = program
  .command("cloud")
  .description("Login or logout for the stack cloud provider (stack .env: AWS_PROFILE, AZURE_SUBSCRIPTION_ID, AZURE_CONFIG_DIR)");

cloud
  .command("login")
  .description("Run aws sso login or az login (then az account set when AZURE_SUBSCRIPTION_ID is set)")
  .action(() => {
    process.exit(runCloudLogin());
  });

cloud
  .command("logout")
  .description("Run aws sso logout or az logout")
  .action(() => {
    process.exit(runCloudLogout());
  });

program
  .command("deploy")
  .description("Validate stack, check credentials, deploy to the active cloud")
  .action(async () => {
    await runDeploy();
  });

program
  .command("dev")
  .description("Local dev: gateway + Vite (when cells define frontend)")
  .action(async () => {
    await runDev();
  });

program
  .command("test")
  .description("Run tests in stack and cell packages (fail-fast)")
  .action(() => {
    runTestCommand();
  });

program
  .command("lint")
  .description("Run biome check on workspace, stack, and cells (fail-fast; requires biome.json)")
  .action(() => {
    runLintCommand();
  });

program
  .command("typecheck")
  .description("Run typecheck script in stack and cell packages when present (fail-fast)")
  .action(() => {
    runTypecheckCommand();
  });

program
  .command("host-kind")
  .description("Print detected cloud host (aws or azure) from --region or --location")
  .option("--region <region>", "AWS region (e.g. us-east-1)")
  .option("--location <location>", "Azure location (e.g. eastus)")
  .action((opts: { region?: string; location?: string }) => {
    const region = opts.region?.trim() ?? "";
    const location = opts.location?.trim() ?? "";
    if (region && !location) {
      console.log(createHostAdapterForCloud({ provider: "aws", region }).providerId);
      return;
    }
    if (location && !region) {
      console.log(createHostAdapterForCloud({ provider: "azure", location }).providerId);
      return;
    }
    throw new Error('host-kind: pass exactly one of --region (AWS) or --location (Azure)');
  });

try {
  await program.parseAsync(process.argv);
} catch (e) {
  if (e instanceof OtaviaCredentialUserError) {
    console.error(e.message.trimEnd());
    process.exit(1);
  }
  throw e;
}
