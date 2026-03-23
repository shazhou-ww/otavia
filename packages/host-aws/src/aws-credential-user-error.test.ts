import { describe, expect, test } from "bun:test";
import { awsCredentialUserInstructions } from "./aws-credential-user-error.js";

describe("awsCredentialUserInstructions", () => {
  test("missing credentials → aws configure only", () => {
    const m = awsCredentialUserInstructions("Unable to locate credentials");
    expect(m).toContain("aws configure");
    expect(m).not.toContain("sso login");
  });

  test("other failures → aws sso login and optional AWS_PROFILE line", () => {
    const m = awsCredentialUserInstructions("ExpiredToken");
    expect(m).toContain("aws sso login");
    expect(m).not.toContain("--profile");
    expect(m).toContain("AWS_PROFILE");
  });
});
