import { describe, expect, test } from "bun:test";
import type { StackModel } from "@otavia/stack";
import { deployInputFromStackModel } from "./deploy.js";

describe("deployInputFromStackModel", () => {
  test("maps environment bindings to env var names", () => {
    const model = {
      name: "main",
      provider: { region: "us-east-1" },
      topLevelVariableValues: { "app.url": "https://x" },
      environments: [{ logicalKey: "app.url", envVarName: "APP_URL" }],
      secrets: [],
    } as unknown as StackModel;
    const input = deployInputFromStackModel(model, "/abs/stack");
    expect(input.stackRoot).toBe("/abs/stack");
    expect(input.environments.APP_URL).toBe("https://x");
    expect(input.provider.region).toBe("us-east-1");
  });
});
