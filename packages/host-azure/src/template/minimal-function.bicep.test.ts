import { describe, expect, test } from "bun:test";
import { buildMinimalFunctionBicep } from "./minimal-function.bicep.js";

describe("buildMinimalFunctionBicep", () => {
  test("declares resource group scope and function app resources", () => {
    const s = buildMinimalFunctionBicep();
    expect(s).toContain("Microsoft.Web/sites");
    expect(s).toContain("Microsoft.Storage/storageAccounts");
    expect(s).toContain("items(envSettings)");
  });

  test("includes Cosmos Table API when resourceTables non-empty", () => {
    const s = buildMinimalFunctionBicep({
      resourceTables: [
        {
          logicalId: "settings",
          partitionKeyAttr: "pk",
          rowKeyAttr: "sk",
          envSuffix: "SETTINGS",
        },
      ],
    });
    expect(s).toContain("Microsoft.DocumentDB/databaseAccounts");
    expect(s).toContain("EnableTable");
    expect(s).toContain('OTAVIA_TABLE_${t.envSuffix}_ENDPOINT');
    expect(s).toContain("flatten(tableEnvBlocks)");
  });
});
