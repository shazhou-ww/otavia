/**
 * Portable row store (DynamoDB-style partition + sort key) — contract only.
 * @see docs/superpowers/specs/2026-03-23-otavia-runtime-table-store-design.md
 */

/** Scalar types mappable to DynamoDB and Cosmos Table API in v1. */
export type TableAttributeValue = string | number | boolean | Uint8Array;

/** One row: keys plus user attributes (keys are not duplicated in `attributes`). */
export type TableRow = {
  partitionKey: string;
  rowKey: string;
  attributes: Record<string, TableAttributeValue>;
};

export type GetRowInput = {
  partitionKey: string;
  rowKey: string;
};

export type PutRowInput = {
  partitionKey: string;
  rowKey: string;
  attributes: Record<string, TableAttributeValue>;
};

export type DeleteRowInput = {
  partitionKey: string;
  rowKey: string;
};

/** v1: partition fixed; rowKey filter — only operators both clouds support without GSI. */
export type RowKeyCondition =
  | { kind: "eq"; rowKey: string }
  | { kind: "beginsWith"; prefix: string };

export type QueryPartitionInput = {
  partitionKey: string;
  rowKey: RowKeyCondition;
};

export type TableStoreErrorCode =
  | "NotFound"
  | "ConditionalFailed"
  | "Throttled"
  | "ValidationError"
  | "Internal";

const errorCodeSet = new Set<TableStoreErrorCode>([
  "NotFound",
  "ConditionalFailed",
  "Throttled",
  "ValidationError",
  "Internal",
]);

export class TableStoreError extends Error {
  readonly code: TableStoreErrorCode;

  constructor(code: TableStoreErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TableStoreError";
    this.code = code;
  }
}

export function isTableStoreError(e: unknown): e is TableStoreError {
  return e instanceof TableStoreError && errorCodeSet.has(e.code);
}

/** True if `n` is a safe integer for portable numeric attributes (IEEE double, no loss). */
export function isSafeTableNumber(n: number): boolean {
  return Number.isFinite(n) && Math.floor(n) === n && Math.abs(n) <= Number.MAX_SAFE_INTEGER;
}

export interface TableStore {
  getRow(input: GetRowInput): Promise<TableRow>;
  putRow(input: PutRowInput): Promise<void>;
  deleteRow(input: DeleteRowInput): Promise<void>;
  queryPartition(input: QueryPartitionInput): Promise<TableRow[]>;
}
