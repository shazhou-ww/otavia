import { describe, expect, test } from "bun:test";
import { parseAwsConfigProfiles } from "./parse-aws-config-profiles.js";

describe("parseAwsConfigProfiles", () => {
  test("default and profile sections", () => {
    const text = `
[default]
region = us-east-1

[profile dev]
region = us-west-2

[profile staging]
`;
    expect(parseAwsConfigProfiles(text)).toEqual(["default", "dev", "staging"]);
  });

  test("dedupes default", () => {
    expect(parseAwsConfigProfiles("[default]\n[default]\n")).toEqual(["default"]);
  });

  test("ignores non-profile sections", () => {
    expect(parseAwsConfigProfiles("[sso-session foo]\n[profile p]\n")).toEqual(["p"]);
  });
});
