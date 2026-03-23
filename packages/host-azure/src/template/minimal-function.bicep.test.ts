import { describe, expect, test } from "bun:test";
import { buildMinimalFunctionBicep } from "./minimal-function.bicep.js";

describe("buildMinimalFunctionBicep", () => {
  test("declares resource group scope and function app resources", () => {
    const s = buildMinimalFunctionBicep();
    expect(s).toContain("Microsoft.Web/sites");
    expect(s).toContain("Microsoft.Storage/storageAccounts");
    expect(s).toContain("items(envSettings)");
  });
});
