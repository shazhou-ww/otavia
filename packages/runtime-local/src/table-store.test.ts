import { describe, expect, test } from "bun:test";
import { isTableStoreError, TableStoreError } from "@otavia/runtime-contract";
import { createLocalTableStore } from "./table-store.js";

describe("createLocalTableStore", () => {
  test("getRow throws NotFound when missing", async () => {
    const store = createLocalTableStore();
    try {
      await store.getRow({ partitionKey: "p", rowKey: "r" });
      expect.unreachable();
    } catch (e) {
      expect(isTableStoreError(e)).toBe(true);
      expect((e as TableStoreError).code).toBe("NotFound");
    }
  });

  test("putRow and getRow round-trip", async () => {
    const store = createLocalTableStore();
    await store.putRow({
      partitionKey: "p",
      rowKey: "r",
      attributes: { n: 1, s: "a", b: true, u: new Uint8Array([1, 2]) },
    });
    const row = await store.getRow({ partitionKey: "p", rowKey: "r" });
    expect(row.partitionKey).toBe("p");
    expect(row.rowKey).toBe("r");
    expect(row.attributes.n).toBe(1);
    expect(row.attributes.s).toBe("a");
    expect(row.attributes.u).toEqual(new Uint8Array([1, 2]));
    const u = row.attributes.u;
    if (u instanceof Uint8Array) u[0] = 9;
    const again = await store.getRow({ partitionKey: "p", rowKey: "r" });
    expect(again.attributes.u).toEqual(new Uint8Array([1, 2]));
  });

  test("deleteRow removes row", async () => {
    const store = createLocalTableStore();
    await store.putRow({ partitionKey: "p", rowKey: "r", attributes: {} });
    await store.deleteRow({ partitionKey: "p", rowKey: "r" });
    try {
      await store.getRow({ partitionKey: "p", rowKey: "r" });
      expect.unreachable();
    } catch (e) {
      expect((e as TableStoreError).code).toBe("NotFound");
    }
  });

  test("queryPartition eq", async () => {
    const store = createLocalTableStore();
    await store.putRow({ partitionKey: "p", rowKey: "a", attributes: {} });
    await store.putRow({ partitionKey: "p", rowKey: "b", attributes: {} });
    const rows = await store.queryPartition({
      partitionKey: "p",
      rowKey: { kind: "eq", rowKey: "b" },
    });
    expect(rows.length).toBe(1);
    expect(rows[0]?.rowKey).toBe("b");
  });

  test("queryPartition beginsWith", async () => {
    const store = createLocalTableStore();
    await store.putRow({ partitionKey: "p", rowKey: "user/1", attributes: {} });
    await store.putRow({ partitionKey: "p", rowKey: "user/2", attributes: {} });
    await store.putRow({ partitionKey: "p", rowKey: "other", attributes: {} });
    const rows = await store.queryPartition({
      partitionKey: "p",
      rowKey: { kind: "beginsWith", prefix: "user/" },
    });
    expect(rows.map((r) => r.rowKey).sort()).toEqual(["user/1", "user/2"]);
  });
});
