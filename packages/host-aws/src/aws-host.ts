import {
  OtaviaCredentialUserError,
  type DeployInput,
  type HostAdapter,
} from "@otavia/host-contract";
import { awsCredentialUserInstructions } from "./aws-credential-user-error.js";
import type { CommandRunner } from "./command-runner.js";
import { defaultAwsRunner } from "./command-runner.js";
import { deployAwsStack } from "./deploy/deploy-stack.js";

export { awsCredentialUserInstructions } from "./aws-credential-user-error.js";

export type CreateAwsHostOptions = {
  run?: CommandRunner;
};

/**
 * AWS {@link HostAdapter}: CLI checks (Task 12) and CloudFormation deploy (Task 13).
 */
export function createAwsHost(options?: CreateAwsHostOptions): HostAdapter {
  const run = options?.run ?? defaultAwsRunner;

  return {
    providerId: "aws",
    async checkToolchain() {
      const r = await run("aws", ["--version"]);
      if (r.exitCode !== 0) {
        const detail = (r.stderr || r.stdout).trim() || `exit ${r.exitCode}`;
        throw new Error(`AWS CLI toolchain check failed: ${detail}`);
      }
    },
    async checkCredentials() {
      const r = await run("aws", ["sts", "get-caller-identity"]);
      if (r.exitCode !== 0) {
        const detail = (r.stderr || r.stdout).trim() || `exit ${r.exitCode}`;
        throw new OtaviaCredentialUserError(awsCredentialUserInstructions(detail));
      }
    },
    async deployStack(input: DeployInput) {
      await deployAwsStack(input, run);
    },
  };
}
