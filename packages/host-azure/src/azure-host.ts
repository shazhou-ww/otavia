import type { DeployInput, HostAdapter } from "@otavia/host-contract";
import type { CommandRunner } from "./command-runner.js";
import { defaultAzureRunner } from "./command-runner.js";
import { deployAzureStack } from "./deploy/deploy-stack.js";

export type CreateAzureHostOptions = {
  run?: CommandRunner;
};

export function createAzureHost(options?: CreateAzureHostOptions): HostAdapter {
  const run = options?.run ?? defaultAzureRunner;

  return {
    providerId: "azure",
    async checkToolchain() {
      const az = await run("az", ["version"]);
      if (az.exitCode !== 0) {
        const detail = (az.stderr || az.stdout).trim() || `exit ${az.exitCode}`;
        throw new Error(`Azure CLI toolchain check failed: ${detail}`);
      }
      const bicep = await run("az", ["bicep", "version"]);
      if (bicep.exitCode !== 0) {
        const standalone = await run("bicep", ["--version"]);
        if (standalone.exitCode !== 0) {
          const d2 = (standalone.stderr || standalone.stdout).trim() || `exit ${standalone.exitCode}`;
          throw new Error(`Bicep CLI not available (tried "az bicep version" and "bicep --version"): ${d2}`);
        }
      }
    },
    async checkCredentials() {
      const r = await run("az", ["account", "show"]);
      if (r.exitCode !== 0) {
        const detail = (r.stderr || r.stdout).trim() || `exit ${r.exitCode}`;
        throw new Error(`Azure credentials check failed: ${detail}`);
      }
    },
    async deployStack(input: DeployInput) {
      await deployAzureStack(input, run);
    },
  };
}
