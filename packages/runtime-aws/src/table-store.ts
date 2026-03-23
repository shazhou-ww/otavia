import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  DynamoDBServiceException,
  ProvisionedThroughputExceededException,
  ResourceNotFoundException,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import {
  isSafeTableNumber,
  TableStoreError,
  tableLogicalIdToEnvSuffix,
  type DeleteRowInput,
  type GetRowInput,
  type PutRowInput,
  type QueryPartitionInput,
  type TableAttributeValue,
  type TableRow,
  type TableStore,
} from "@otavia/runtime-contract";

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    throw new TableStoreError("ValidationError", `missing required environment variable ${name}`);
  }
  return v;
}

function validateAttributes(attributes: Record<string, TableAttributeValue>): void {
  for (const [k, v] of Object.entries(attributes)) {
    if (k.length === 0) {
      throw new TableStoreError("ValidationError", "attribute keys must be non-empty");
    }
    if (typeof v === "number" && !isSafeTableNumber(v)) {
      throw new TableStoreError(
        "ValidationError",
        `attribute "${k}" must be a safe integer for portable table numbers`
      );
    }
  }
}

function assertNonEmpty(label: string, value: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new TableStoreError("ValidationError", `${label} must be a non-empty string`);
  }
}

function itemToRow(
  item: Record<string, unknown>,
  pkAttr: string,
  skAttr: string
): TableRow {
  const pk = item[pkAttr];
  const sk = item[skAttr];
  if (typeof pk !== "string" || typeof sk !== "string") {
    throw new TableStoreError("Internal", "DynamoDB item missing string partition or row key");
  }
  const attributes: Record<string, TableAttributeValue> = {};
  for (const [k, v] of Object.entries(item)) {
    if (k === pkAttr || k === skAttr) continue;
    if (v === undefined || v === null) continue;
    if (
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean" ||
      v instanceof Uint8Array
    ) {
      if (typeof v === "number" && !isSafeTableNumber(v)) {
        throw new TableStoreError("Internal", `unsafe numeric attribute "${k}" from DynamoDB`);
      }
      attributes[k] = v;
    }
  }
  return { partitionKey: pk, rowKey: sk, attributes };
}

function mapAwsError(e: unknown): TableStoreError {
  if (e instanceof ResourceNotFoundException) {
    return new TableStoreError("NotFound", e.message, { cause: e });
  }
  if (e instanceof ConditionalCheckFailedException) {
    return new TableStoreError("ConditionalFailed", e.message, { cause: e });
  }
  if (e instanceof ProvisionedThroughputExceededException) {
    return new TableStoreError("Throttled", e.message, { cause: e });
  }
  if (e instanceof DynamoDBServiceException && e.name === "ThrottlingException") {
    return new TableStoreError("Throttled", e.message, { cause: e });
  }
  if (e instanceof TableStoreError) return e;
  if (e instanceof Error) {
    return new TableStoreError("Internal", e.message, { cause: e });
  }
  return new TableStoreError("Internal", String(e));
}

export type AwsTableStoreOptions = {
  /** Defaults to a regional client with default credential chain. */
  documentClient?: DynamoDBDocumentClient;
};

/**
 * DynamoDB-backed {@link TableStore}. Reads `OTAVIA_TABLE_<suffix>_{NAME,PARTITION_KEY,ROW_KEY}`.
 */
export function createAwsTableStore(logicalTableId: string, options?: AwsTableStoreOptions): TableStore {
  const suffix = tableLogicalIdToEnvSuffix(logicalTableId);
  const tableName = () => requireEnv(`OTAVIA_TABLE_${suffix}_NAME`);
  const pkAttr = () => requireEnv(`OTAVIA_TABLE_${suffix}_PARTITION_KEY`);
  const skAttr = () => requireEnv(`OTAVIA_TABLE_${suffix}_ROW_KEY`);

  const client =
    options?.documentClient ??
    DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });

  return {
    async getRow(input: GetRowInput): Promise<TableRow> {
      assertNonEmpty("partitionKey", input.partitionKey);
      assertNonEmpty("rowKey", input.rowKey);
      const pk = pkAttr();
      const sk = skAttr();
      try {
        const out = await client.send(
          new GetCommand({
            TableName: tableName(),
            Key: { [pk]: input.partitionKey, [sk]: input.rowKey },
          })
        );
        if (!out.Item) {
          throw new TableStoreError(
            "NotFound",
            `row not found: ${input.partitionKey} / ${input.rowKey}`
          );
        }
        return itemToRow(out.Item as Record<string, unknown>, pk, sk);
      } catch (e) {
        throw mapAwsError(e);
      }
    },

    async putRow(input: PutRowInput): Promise<void> {
      assertNonEmpty("partitionKey", input.partitionKey);
      assertNonEmpty("rowKey", input.rowKey);
      validateAttributes(input.attributes);
      const pk = pkAttr();
      const sk = skAttr();
      const item: Record<string, unknown> = {
        [pk]: input.partitionKey,
        [sk]: input.rowKey,
        ...input.attributes,
      };
      try {
        await client.send(
          new PutCommand({
            TableName: tableName(),
            Item: item,
          })
        );
      } catch (e) {
        throw mapAwsError(e);
      }
    },

    async deleteRow(input: DeleteRowInput): Promise<void> {
      assertNonEmpty("partitionKey", input.partitionKey);
      assertNonEmpty("rowKey", input.rowKey);
      const pk = pkAttr();
      const sk = skAttr();
      try {
        const out = await client.send(
          new DeleteCommand({
            TableName: tableName(),
            Key: { [pk]: input.partitionKey, [sk]: input.rowKey },
            ReturnValues: "ALL_OLD",
          })
        );
        if (!out.Attributes) {
          throw new TableStoreError(
            "NotFound",
            `row not found: ${input.partitionKey} / ${input.rowKey}`
          );
        }
      } catch (e) {
        throw mapAwsError(e);
      }
    },

    async queryPartition(input: QueryPartitionInput): Promise<TableRow[]> {
      assertNonEmpty("partitionKey", input.partitionKey);
      const pk = pkAttr();
      const sk = skAttr();
      const names: Record<string, string> = { "#pk": pk, "#sk": sk };
      try {
        if (input.rowKey.kind === "eq") {
          assertNonEmpty("rowKey", input.rowKey.rowKey);
          const out = await client.send(
            new QueryCommand({
              TableName: tableName(),
              KeyConditionExpression: "#pk = :pk AND #sk = :sk",
              ExpressionAttributeNames: names,
              ExpressionAttributeValues: {
                ":pk": input.partitionKey,
                ":sk": input.rowKey.rowKey,
              },
            })
          );
          return (out.Items ?? []).map((it) => itemToRow(it as Record<string, unknown>, pk, sk));
        }
        if (input.rowKey.prefix.length === 0) {
          throw new TableStoreError("ValidationError", "beginsWith prefix must be non-empty");
        }
        const out = await client.send(
          new QueryCommand({
            TableName: tableName(),
            KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :pre)",
            ExpressionAttributeNames: names,
            ExpressionAttributeValues: {
              ":pk": input.partitionKey,
              ":pre": input.rowKey.prefix,
            },
          })
        );
        return (out.Items ?? []).map((it) => itemToRow(it as Record<string, unknown>, pk, sk));
      } catch (e) {
        throw mapAwsError(e);
      }
    },
  };
}
