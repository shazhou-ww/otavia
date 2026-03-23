import { AzureNamedKeyCredential, TableClient } from "@azure/data-tables";
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

function assertNonEmpty(label: string, value: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new TableStoreError("ValidationError", `${label} must be a non-empty string`);
  }
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

function odataString(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

const ENTITY_SYSTEM = new Set([
  "partitionKey",
  "rowKey",
  "etag",
  "timestamp",
  "odata.etag",
]);

function entityToRow(e: Record<string, unknown>): TableRow {
  const pk = e.partitionKey;
  const rk = e.rowKey;
  if (typeof pk !== "string" || typeof rk !== "string") {
    throw new TableStoreError("Internal", "table entity missing partitionKey or rowKey");
  }
  const attributes: Record<string, TableAttributeValue> = {};
  for (const [k, v] of Object.entries(e)) {
    if (ENTITY_SYSTEM.has(k)) continue;
    if (v === undefined || v === null) continue;
    if (
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean" ||
      v instanceof Uint8Array
    ) {
      if (typeof v === "number" && !isSafeTableNumber(v)) {
        throw new TableStoreError("Internal", `unsafe numeric attribute "${k}" from table store`);
      }
      attributes[k] = v;
    }
  }
  return { partitionKey: pk, rowKey: rk, attributes };
}

function isNotFoundError(e: unknown): boolean {
  if (e == null || typeof e !== "object") return false;
  const o = e as { statusCode?: number; code?: string };
  return o.statusCode === 404 || o.code === "EntityNotFound" || o.code === "ResourceNotFound";
}

function mapAzureError(e: unknown): TableStoreError {
  if (e instanceof TableStoreError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  if (isNotFoundError(e)) {
    return new TableStoreError("NotFound", msg, { cause: e instanceof Error ? e : undefined });
  }
  if (e instanceof Error) {
    const lower = msg.toLowerCase();
    if (lower.includes("throttl") || lower.includes("429")) {
      return new TableStoreError("Throttled", msg, { cause: e });
    }
    return new TableStoreError("Internal", msg, { cause: e });
  }
  return new TableStoreError("Internal", msg);
}

function buildTableClient(suffix: string, client?: TableClient): TableClient {
  if (client) return client;
  const endpoint = requireEnv(`OTAVIA_TABLE_${suffix}_ENDPOINT`);
  const name = requireEnv(`OTAVIA_TABLE_${suffix}_NAME`);
  const key = requireEnv(`OTAVIA_TABLE_${suffix}_KEY`);
  let account: string;
  try {
    account = new URL(endpoint).hostname.split(".")[0] ?? "";
  } catch {
    throw new TableStoreError("ValidationError", "OTAVIA_TABLE_*_ENDPOINT must be a valid URL");
  }
  if (!account) {
    throw new TableStoreError("ValidationError", "could not derive storage account name from endpoint");
  }
  const credential = new AzureNamedKeyCredential(account, key);
  return new TableClient(endpoint, name, credential);
}

export type AzureTableStoreOptions = {
  tableClient?: TableClient;
};

/**
 * Cosmos / Azure Table API {@link TableStore}.
 * Uses fixed PartitionKey/RowKey columns; reads `OTAVIA_TABLE_<suffix>_{ENDPOINT,NAME,KEY}`.
 * PARTITION_KEY / ROW_KEY env vars (if set) are ignored on the wire — reserved for app parity only.
 */
export function createAzureTableStore(logicalTableId: string, options?: AzureTableStoreOptions): TableStore {
  const suffix = tableLogicalIdToEnvSuffix(logicalTableId);

  const client = () => buildTableClient(suffix, options?.tableClient);

  return {
    async getRow(input: GetRowInput): Promise<TableRow> {
      assertNonEmpty("partitionKey", input.partitionKey);
      assertNonEmpty("rowKey", input.rowKey);
      try {
        const raw = await client().getEntity(input.partitionKey, input.rowKey);
        return entityToRow(raw as unknown as Record<string, unknown>);
      } catch (e) {
        if (isNotFoundError(e)) {
          throw new TableStoreError(
            "NotFound",
            `row not found: ${input.partitionKey} / ${input.rowKey}`,
            { cause: e instanceof Error ? e : undefined }
          );
        }
        throw mapAzureError(e);
      }
    },

    async putRow(input: PutRowInput): Promise<void> {
      assertNonEmpty("partitionKey", input.partitionKey);
      assertNonEmpty("rowKey", input.rowKey);
      validateAttributes(input.attributes);
      const entity: Record<string, unknown> = {
        partitionKey: input.partitionKey,
        rowKey: input.rowKey,
        ...input.attributes,
      };
      try {
        await client().upsertEntity(entity as never, "Replace");
      } catch (e) {
        throw mapAzureError(e);
      }
    },

    async deleteRow(input: DeleteRowInput): Promise<void> {
      assertNonEmpty("partitionKey", input.partitionKey);
      assertNonEmpty("rowKey", input.rowKey);
      try {
        await client().deleteEntity(input.partitionKey, input.rowKey);
      } catch (e) {
        if (isNotFoundError(e)) {
          throw new TableStoreError(
            "NotFound",
            `row not found: ${input.partitionKey} / ${input.rowKey}`,
            { cause: e instanceof Error ? e : undefined }
          );
        }
        throw mapAzureError(e);
      }
    },

    async queryPartition(input: QueryPartitionInput): Promise<TableRow[]> {
      assertNonEmpty("partitionKey", input.partitionKey);
      const c = client();
      try {
        if (input.rowKey.kind === "eq") {
          assertNonEmpty("rowKey", input.rowKey.rowKey);
          const filter = `PartitionKey eq ${odataString(input.partitionKey)} and RowKey eq ${odataString(input.rowKey.rowKey)}`;
          const out: TableRow[] = [];
          for await (const e of c.listEntities<Record<string, unknown>>({
            queryOptions: { filter },
          })) {
            out.push(entityToRow(e));
          }
          return out;
        }
        if (input.rowKey.prefix.length === 0) {
          throw new TableStoreError("ValidationError", "beginsWith prefix must be non-empty");
        }
        const pre = input.rowKey.prefix;
        const filter = `PartitionKey eq ${odataString(input.partitionKey)} and RowKey ge ${odataString(pre)} and RowKey lt ${odataString(`${pre}\uffff`)}`;
        const out: TableRow[] = [];
        for await (const e of c.listEntities<Record<string, unknown>>({
          queryOptions: { filter },
        })) {
          if (typeof e.rowKey === "string" && e.rowKey.startsWith(pre)) {
            out.push(entityToRow(e));
          }
        }
        out.sort((a, b) => (a.rowKey < b.rowKey ? -1 : a.rowKey > b.rowKey ? 1 : 0));
        return out;
      } catch (e) {
        throw mapAzureError(e);
      }
    },
  };
}
