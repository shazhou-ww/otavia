import type { HostAdapter } from "@otavia/host-contract";
import { createAwsHost } from "@otavia/host-aws";
import { createAzureHost } from "@otavia/host-azure";
import { providerKind } from "@otavia/stack";

/**
 * Discriminates AWS vs Azure using the same rules as {@link providerKind} (`otavia.yaml` `provider` block).
 */
export function createHostAdapterForProvider(provider: Record<string, unknown>): HostAdapter {
  const id = providerKind(provider);
  return id === "aws" ? createAwsHost() : createAzureHost();
}
