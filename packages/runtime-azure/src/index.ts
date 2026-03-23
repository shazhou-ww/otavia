import type { CloudPlatform } from "@otavia/runtime-contract";

export { createAzureTableStore, type AzureTableStoreOptions } from "./table-store.js";

export function platform(): CloudPlatform {
  return "azure";
}
