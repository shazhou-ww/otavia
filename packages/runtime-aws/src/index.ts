import type { CloudPlatform } from "@otavia/runtime-contract";

export { createAwsTableStore, type AwsTableStoreOptions } from "./table-store.js";

export function platform(): CloudPlatform {
  return "aws";
}
