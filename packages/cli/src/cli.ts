#!/usr/bin/env bun
import { Command } from "commander";
import { createHostAdapterForProvider } from "./host/create-host-adapter.js";

const program = new Command();

program.name("otavia").version("0.0.1");

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
