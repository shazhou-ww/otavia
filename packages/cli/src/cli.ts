#!/usr/bin/env bun
import { Command } from "commander";
import { runInit } from "./commands/init.js";
import { runDeploy } from "./commands/deploy.js";
import { runSetup } from "./commands/setup.js";
import { createHostAdapterForProvider } from "./host/create-host-adapter.js";

const program = new Command();

program.name("otavia").version("0.0.1");

program
  .command("init")
  .description("Create a new Otavia workspace (stacks + cells)")
  .argument("[directory]", "empty target directory", ".")
  .option("--provider <id>", "aws or azure", "aws")
  .action(async (directory: string, opts: { provider: string }) => {
    const p = opts.provider;
    if (p !== "aws" && p !== "azure") {
      throw new Error('Invalid --provider: use "aws" or "azure"');
    }
    await runInit(directory, { provider: p });
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
  .command("host-kind")
  .description("Print detected cloud host (aws or azure) from provider flags")
  .option("--region <region>", "AWS region (e.g. us-east-1)")
  .option("--location <location>", "Azure location (e.g. eastus)")
  .action((opts: { region?: string; location?: string }) => {
    const provider: Record<string, unknown> = {};
    if (opts.region != null && opts.region !== "") provider.region = opts.region;
    if (opts.location != null && opts.location !== "") provider.location = opts.location;
    const host = createHostAdapterForProvider(provider);
    console.log(host.providerId);
  });

program.parse();
