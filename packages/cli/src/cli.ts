#!/usr/bin/env bun
import { OtaviaCredentialUserError } from "@otavia/host-contract";
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

const program = new Command();

program.name("otavia").version("0.0.1");

program
  .command("init")
  .description("Create a new Otavia workspace (stacks + cells)")
  .argument("[directory]", "empty target directory", ".")
  .option("--region <region>", 'AWS region (e.g. "us-east-1")', "us-east-1")
  .option(
    "--use-global-otavia",
    "omit stacks/main devDependencies @otavia/cli (avoids install failure when the package is unpublished); scripts use `otavia` on PATH — use `bun link --global` in packages/cli or a global install"
  )
  .action(async (directory: string, opts: { region?: string; useGlobalOtavia?: boolean }) => {
    const region = opts.region?.trim() || "us-east-1";
    await runInit(directory, { region, useGlobalOtavia: opts.useGlobalOtavia === true });
  });

program
  .command("setup")
  .description(
    "Bootstrap env files, validate stack model, check cloud CLI; interactive TTY prompts for AWS_PROFILE"
  )
  .action(async () => {
    await runSetup();
  });

const cloud = program
  .command("cloud")
  .description("Login or logout for AWS (stack .env: AWS_PROFILE)");

cloud
  .command("login")
  .description("Run aws sso login")
  .action(() => {
    process.exit(runCloudLogin());
  });

cloud
  .command("logout")
  .description("Run aws sso logout")
  .action(() => {
    process.exit(runCloudLogout());
  });

program
  .command("deploy")
  .description("Validate stack, check credentials, deploy to AWS")
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
  .description("Print detected cloud host (always aws)")
  .option("--region <region>", "AWS region (e.g. us-east-1)", "us-east-1")
  .action((opts: { region?: string }) => {
    const region = opts.region?.trim() || "us-east-1";
    console.log(createHostAdapterForCloud({ provider: "aws", region }).providerId);
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
