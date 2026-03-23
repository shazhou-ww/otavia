import { describe, expect, test } from "bun:test";
import { buildMinimalHttpLambdaTemplate } from "./minimal-http-lambda.js";

describe("buildMinimalHttpLambdaTemplate", () => {
  test("includes Lambda and function URL resources", () => {
    const y = buildMinimalHttpLambdaTemplate({ environments: {} });
    expect(y).toContain("AWS::Lambda::Function");
    expect(y).toContain("AWS::Lambda::Url");
  });

  test("embeds environment variables when provided", () => {
    const y = buildMinimalHttpLambdaTemplate({ environments: { FOO: "bar" } });
    expect(y).toContain("Environment:");
    expect(y).toContain("FOO:");
    expect(y).toContain('"bar"');
  });
});
