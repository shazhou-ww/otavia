export type CloudPlatform = "aws";

export {
  isSafeTableNumber,
  isTableStoreError,
  tableLogicalIdToEnvSuffix,
  TableStoreError,
} from "./table-store.js";
export type {
  DeleteRowInput,
  GetRowInput,
  PutRowInput,
  QueryPartitionInput,
  RowKeyCondition,
  TableAttributeValue,
  TableRow,
  TableStore,
  TableStoreErrorCode,
} from "./table-store.js";
