import { describe, expect, test } from "bun:test";
import { azureCredentialUserInstructions } from "./azure-credential-user-error.js";

describe("azureCredentialUserInstructions", () => {
  test("primary az login and subscription other option", () => {
    const m = azureCredentialUserInstructions("Please run az login");
    expect(m).toContain("az login");
    expect(m).toContain("az account set");
  });
});
