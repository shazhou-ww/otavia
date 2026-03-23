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

  test("adds DynamoDB tables and OTAVIA_TABLE_* when resourceTables set", () => {
    const y = buildMinimalHttpLambdaTemplate({
      environments: {},
      resourceTables: [
        {
          logicalId: "settings",
          partitionKeyAttr: "pk",
          rowKeyAttr: "sk",
          envSuffix: "SETTINGS",
        },
      ],
    });
    expect(y).toContain("AWS::DynamoDB::Table");
    expect(y).toContain("SettingsTable:");
    expect(y).toContain("OtaviaDynamoDbData");
    expect(y).toContain("OTAVIA_TABLE_SETTINGS_NAME:");
    expect(y).toContain("!Ref SettingsTable");
    expect(y).toContain("OTAVIA_TABLE_SETTINGS_PARTITION_KEY:");
    expect(y).toContain("OTAVIA_TABLE_SETTINGS_ROW_KEY:");
  });
});
