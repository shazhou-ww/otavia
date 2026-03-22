#!/usr/bin/env bun
import { Command } from "commander";
import { setupCommand, type SetupTunnelIntent } from "./commands/setup";
import { cleanCommand } from "./commands/clean";
import { awsLoginCommand, awsLogoutCommand } from "./commands/aws";
import { devCommand } from "./commands/dev";
import { testUnitCommand, testE2eCommand } from "./commands/test";
import { typecheckCommand } from "./commands/typecheck";
import { lintCommand } from "./commands/lint";
import { deployCommand } from "./commands/deploy";
import { listCellsCommand } from "./commands/cell";
import { initCommand, resolvePackageScopeForInit } from "./commands/init";
import { getOtaviaPackageVersion } from "./package-version";

const program = new Command();

program
  .name("otavia")
  .description("CLI for Otavia stack")
  .version(getOtaviaPackageVersion());

program
  .command("init")
  .description(
    "Scaffold monorepo: workspaces, apps/main (entry + otavia.yaml), cells/* at repo root, root scripts"
  )
  .option(
    "--force",
    "Overwrite existing scaffold (apps/main, cells/hello, package.json files, .env)"
  )
  .option("--stack-name <name>", "CloudFormation stack name (default: current directory name)")
  .option("--domain <host>", "Primary domain host (default: example.com)")
  .option(
    "--use-defaults",
    "Non-interactive: allow default stack name (directory) and domain (example.com) without --stack-name/--domain"
  )
  .option(
    "--scope <scope>",
    'npm scope for @scope/main and @scope/<cell> (e.g. acme or @acme); omit to prompt, or use directory name in non-TTY'
  )
  .action(
    async (
      _args: unknown,
      cmd: {
        opts: () => {
          force?: boolean;
          stackName?: string;
          domain?: string;
          scope?: string;
          useDefaults?: boolean;
        };
      }
    ) => {
      const opts = cmd.opts();
      if (!process.stdin.isTTY && !opts.useDefaults) {
        const sn = opts.stackName?.trim();
        const dom = opts.domain?.trim();
        if (!sn || !dom) {
          throw new Error(
            "Non-interactive init requires --stack-name and --domain, or pass --use-defaults to use the directory name and example.com."
          );
        }
      }
      const packageScope = await resolvePackageScopeForInit({
        cwd: process.cwd(),
        explicitScope: opts.scope,
      });
      initCommand(process.cwd(), {
        force: opts.force,
        stackName: opts.stackName,
        domain: opts.domain,
        packageScope,
      });
    }
  );

program.command("setup")
  .description("Setup Otavia stack")
  .option("--tunnel", "Setup tunnel for remote dev")
  .action(
    async (
      _args: unknown,
      cmd: {
        opts: () => { tunnel?: boolean };
        getOptionValueSource: (name: string) => string | undefined;
      }
    ) => {
      const opts = cmd.opts();
      const source = cmd.getOptionValueSource("tunnel");
      const tunnel: SetupTunnelIntent =
        source === "cli"
          ? { mode: "cli", enabled: Boolean(opts.tunnel) }
          : { mode: "prompt" };
      await setupCommand(process.cwd(), { tunnel });
    }
  );
program.command("dev")
  .description("Start development")
  .option("--tunnel", "Enable cloudflared tunnel and use tunnel host URLs")
  .option("--tunnel-host <host>", "Tunnel hostname or full URL used as public base URL")
  .option("--tunnel-config <path>", "Path to cloudflared config.yml")
  .option("--tunnel-protocol <protocol>", "Tunnel transport protocol: quic, http2, or auto")
  .action(
    async (
      _args: unknown,
      cmd: {
        opts: () => {
          tunnel?: boolean;
          tunnelHost?: string;
          tunnelConfig?: string;
          tunnelProtocol?: string;
        };
      }
    ) => {
      const opts = cmd.opts();
      await devCommand(process.cwd(), {
        tunnel: opts.tunnel
          ? {
              mode: "on",
              tunnelHost: opts.tunnelHost,
              tunnelConfig: opts.tunnelConfig,
              tunnelProtocol: opts.tunnelProtocol,
            }
          : { mode: "off" },
      });
    }
  );
program.command("test")
  .description("Run tests (unit then e2e)")
  .action(async () => {
    const rootDir = process.cwd();
    await testUnitCommand(rootDir);
    await testE2eCommand(rootDir);
  });
program.command("test:unit")
  .description("Run unit tests")
  .action(async () => {
    await testUnitCommand(process.cwd());
  });
program.command("test:e2e")
  .description("Run e2e tests")
  .action(async () => {
    await testE2eCommand(process.cwd());
  });
program.command("deploy")
  .description("Deploy stack (build, upload, CloudFormation)")
  .option("--yes", "Skip confirmation")
  .action(async (_args: unknown, cmd: { opts: () => { yes?: boolean } }) => {
    await deployCommand(process.cwd(), { yes: cmd.opts().yes });
  });
program
  .command("typecheck")
  .description("Type check all cells")
  .action(async () => {
    await typecheckCommand(process.cwd());
  });
program
  .command("lint")
  .description("Lint all cells")
  .option("--fix", "Apply safe fixes")
  .option("--unsafe", "Apply unsafe fixes")
  .action(async (_args: unknown, cmd: { opts: () => { fix?: boolean; unsafe?: boolean } }) => {
    const opts = cmd.opts();
    await lintCommand(process.cwd(), { fix: opts.fix, unsafe: opts.unsafe });
  });
program.command("clean").description("Clean artifacts").action(() => {
  cleanCommand(process.cwd());
});

const aws = program.command("aws").description("AWS-related commands");
aws.command("login").description("AWS login").action(async () => { await awsLoginCommand(process.cwd()); });
aws.command("logout").description("AWS logout").action(async () => { await awsLogoutCommand(process.cwd()); });

const cell = program.command("cell").description("List and manage cells");
cell
  .command("list")
  .description("List cells from otavia.yaml and their resolved directories")
  .action(() => {
    listCellsCommand(process.cwd());
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
