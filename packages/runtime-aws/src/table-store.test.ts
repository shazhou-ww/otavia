import { describe, expect, test } from "bun:test";
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { isTableStoreError, TableStoreError } from "@otavia/runtime-contract";
import { createAwsTableStore } from "./table-store.js";

describe("createAwsTableStore", () => {
  test("throws ValidationError when env vars missing", async () => {
    const suffix = "OTAVIA_TABLE_SETTINGS_";
    for (const k of Object.keys(process.env)) {
      if (k.startsWith(suffix)) delete process.env[k];
    }
    const store = createAwsTableStore("settings");
    try {
      await store.getRow({ partitionKey: "p", rowKey: "r" });
      expect.unreachable();
    } catch (e) {
      expect(isTableStoreError(e)).toBe(true);
      expect((e as TableStoreError).code).toBe("ValidationError");
    }
  });

  test("getRow uses GetCommand and maps item to TableRow", async () => {
    process.env.OTAVIA_TABLE_SETTINGS_NAME = "tbl";
    process.env.OTAVIA_TABLE_SETTINGS_PARTITION_KEY = "pk";
    process.env.OTAVIA_TABLE_SETTINGS_ROW_KEY = "sk";

    const sent: unknown[] = [];
    const fake = {
      send: async (cmd: unknown) => {
        sent.push(cmd);
        if (cmd instanceof GetCommand) {
          return {
            Item: { pk: "p", sk: "r", foo: "bar" },
          };
        }
        return {};
      },
    } as unknown as DynamoDBDocumentClient;

    const store = createAwsTableStore("settings", { documentClient: fake });
    const row = await store.getRow({ partitionKey: "p", rowKey: "r" });
    expect(row.partitionKey).toBe("p");
    expect(row.rowKey).toBe("r");
    expect(row.attributes.foo).toBe("bar");
    expect(sent.length).toBe(1);
    expect(sent[0]).toBeInstanceOf(GetCommand);
  });

  test("queryPartition beginsWith sends QueryCommand", async () => {
    process.env.OTAVIA_TABLE_SETTINGS_NAME = "tbl";
    process.env.OTAVIA_TABLE_SETTINGS_PARTITION_KEY = "pk";
    process.env.OTAVIA_TABLE_SETTINGS_ROW_KEY = "sk";

    const fake = {
      send: async (cmd: unknown) => {
        if (cmd instanceof QueryCommand) {
          return { Items: [{ pk: "p", sk: "a1", x: 1 }] };
        }
        return {};
      },
    } as unknown as DynamoDBDocumentClient;

    const store = createAwsTableStore("settings", { documentClient: fake });
    const rows = await store.queryPartition({
      partitionKey: "p",
      rowKey: { kind: "beginsWith", prefix: "a" },
    });
    expect(rows.length).toBe(1);
    expect(rows[0]?.rowKey).toBe("a1");
  });
});
