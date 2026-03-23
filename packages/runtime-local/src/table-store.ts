import {
  isSafeTableNumber,
  TableStoreError,
  type DeleteRowInput,
  type GetRowInput,
  type PutRowInput,
  type QueryPartitionInput,
  type TableAttributeValue,
  type TableRow,
  type TableStore,
} from "@otavia/runtime-contract";

function assertNonEmpty(label: string, value: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new TableStoreError("ValidationError", `${label} must be a non-empty string`);
  }
}

function cloneValue(v: TableAttributeValue): TableAttributeValue {
  if (v instanceof Uint8Array) return new Uint8Array(v);
  return v;
}

function cloneRow(row: TableRow): TableRow {
  const attributes: Record<string, TableAttributeValue> = {};
  for (const [k, v] of Object.entries(row.attributes)) {
    attributes[k] = cloneValue(v);
  }
  return {
    partitionKey: row.partitionKey,
    rowKey: row.rowKey,
    attributes,
  };
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

/**
 * In-memory {@link TableStore}. Each call returns an isolated store instance.
 */
export function createLocalTableStore(): TableStore {
  const byPartition = new Map<string, Map<string, TableRow>>();

  return {
    async getRow(input: GetRowInput): Promise<TableRow> {
      assertNonEmpty("partitionKey", input.partitionKey);
      assertNonEmpty("rowKey", input.rowKey);
      const part = byPartition.get(input.partitionKey);
      const row = part?.get(input.rowKey);
      if (!row) {
        throw new TableStoreError("NotFound", `row not found: ${input.partitionKey} / ${input.rowKey}`);
      }
      return cloneRow(row);
    },

    async putRow(input: PutRowInput): Promise<void> {
      assertNonEmpty("partitionKey", input.partitionKey);
      assertNonEmpty("rowKey", input.rowKey);
      validateAttributes(input.attributes);
      let part = byPartition.get(input.partitionKey);
      if (!part) {
        part = new Map();
        byPartition.set(input.partitionKey, part);
      }
      part.set(input.rowKey, {
        partitionKey: input.partitionKey,
        rowKey: input.rowKey,
        attributes: { ...input.attributes },
      });
    },

    async deleteRow(input: DeleteRowInput): Promise<void> {
      assertNonEmpty("partitionKey", input.partitionKey);
      assertNonEmpty("rowKey", input.rowKey);
      const part = byPartition.get(input.partitionKey);
      if (!part || !part.delete(input.rowKey)) {
        throw new TableStoreError("NotFound", `row not found: ${input.partitionKey} / ${input.rowKey}`);
      }
    },

    async queryPartition(input: QueryPartitionInput): Promise<TableRow[]> {
      assertNonEmpty("partitionKey", input.partitionKey);
      const part = byPartition.get(input.partitionKey);
      if (!part) return [];

      const rows = [...part.values()];

      if (input.rowKey.kind === "eq") {
        assertNonEmpty("rowKey", input.rowKey.rowKey);
        const row = part.get(input.rowKey.rowKey);
        return row ? [cloneRow(row)] : [];
      }

      const cond = input.rowKey;
      if (cond.kind !== "beginsWith") {
        throw new TableStoreError("Internal", "unreachable rowKey condition");
      }
      if (cond.prefix.length === 0) {
        throw new TableStoreError("ValidationError", "beginsWith prefix must be non-empty");
      }
      return rows
        .filter((r) => r.rowKey.startsWith(cond.prefix))
        .map(cloneRow)
        .sort((a, b) => (a.rowKey < b.rowKey ? -1 : a.rowKey > b.rowKey ? 1 : 0));
    },
  };
}
