#!/usr/bin/env bun
import { stdin as input } from "node:process";
import { Command } from "commander";
import { runInit } from "./commands/init.js";
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
  .action(async (directory: string, opts: { provider?: string }) => {
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
    await runInit(directory, { provider });
  });

program
  .command("setup")
  .description("Bootstrap env files, validate stack model, check cloud CLI")
  .action(async () => {
    await runSetup();
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

program.parse();
