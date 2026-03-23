import { describe, expect, test } from "bun:test";
import {
  isSafeTableNumber,
  isTableStoreError,
  tableLogicalIdToEnvSuffix,
  TableStoreError,
  type TableStore,
} from "./table-store.js";

describe("table-store contract", () => {
  test("TableStore type is importable", () => {
    const _x: TableStore | undefined = undefined;
    expect(_x).toBeUndefined();
  });

  test("isTableStoreError", () => {
    const e = new TableStoreError("NotFound", "missing");
    expect(isTableStoreError(e)).toBe(true);
    expect(isTableStoreError(new Error("x"))).toBe(false);
    expect(isTableStoreError(null)).toBe(false);
  });

  test("isSafeTableNumber", () => {
    expect(isSafeTableNumber(0)).toBe(true);
    expect(isSafeTableNumber(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(isSafeTableNumber(1.5)).toBe(false);
    expect(isSafeTableNumber(Number.NaN)).toBe(false);
    expect(isSafeTableNumber(Number.POSITIVE_INFINITY)).toBe(false);
  });

  test("tableLogicalIdToEnvSuffix", () => {
    expect(tableLogicalIdToEnvSuffix("settings")).toBe("SETTINGS");
    expect(tableLogicalIdToEnvSuffix("user-data")).toBe("USER_DATA");
  });
});
