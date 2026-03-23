import type { HostAdapter } from "@otavia/host-contract";
import { createAwsHost } from "@otavia/host-aws";
import { createAzureHost } from "@otavia/host-azure";
import type { CloudProvider } from "@otavia/stack";
import { providerKind } from "@otavia/stack";

/**
 * Selects AWS vs Azure host from {@link CloudProvider} (`otavia.yaml` `cloud` block).
 */
export function createHostAdapterForCloud(cloud: CloudProvider): HostAdapter {
  const id = providerKind(cloud);
  return id === "aws" ? createAwsHost() : createAzureHost();
}
