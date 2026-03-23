import { describe, expect, test } from "bun:test";
import { isTableStoreError, TableStoreError } from "@otavia/runtime-contract";
import { createAzureTableStore } from "./table-store.js";

describe("createAzureTableStore", () => {
  test("throws ValidationError when env vars missing", async () => {
    const prefix = "OTAVIA_TABLE_SETTINGS_";
    for (const k of Object.keys(process.env)) {
      if (k.startsWith(prefix)) delete process.env[k];
    }
    const store = createAzureTableStore("settings");
    try {
      await store.getRow({ partitionKey: "p", rowKey: "r" });
      expect.unreachable();
    } catch (e) {
      expect(isTableStoreError(e)).toBe(true);
      expect((e as TableStoreError).code).toBe("ValidationError");
    }
  });
});
