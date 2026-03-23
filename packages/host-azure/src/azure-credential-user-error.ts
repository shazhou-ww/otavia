/**
 * User-facing lines for Azure `az account show` failure: primary is current CLI context; optional subscription switch.
 */
export function azureCredentialUserInstructions(_azStderrOrStdout: string): string {
  return [
    "Run:",
    "",
    "  az login",
    "",
    "Other options: az account set --subscription <name-or-id> to use a different subscription.",
    "",
  ].join("\n");
}
