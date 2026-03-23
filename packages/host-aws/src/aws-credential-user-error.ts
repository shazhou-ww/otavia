/**
 * User-facing lines for AWS `sts get-caller-identity` failure: one primary command (current CLI default /
 * existing AWS_PROFILE), optional line for switching profiles.
 */
export function awsCredentialUserInstructions(awsStderrOrStdout: string): string {
  const detail = awsStderrOrStdout.trim().toLowerCase();

  if (detail.includes("unable to locate credentials") || detail.includes("could not find credentials")) {
    return ["Run:", "", "  aws configure", ""].join("\n");
  }

  return [
    "Run:",
    "",
    "  aws sso login",
    "",
    "Other options: set AWS_PROFILE to a named profile, then run the same command.",
    "",
  ].join("\n");
}
