import type { HostAdapter } from "@otavia/host-contract";
import { createAwsHost } from "@otavia/host-aws";
import type { CloudProvider } from "@otavia/stack";

/**
 * Creates AWS host adapter from {@link CloudProvider} (`otavia.yaml` `cloud` block).
 * Only AWS is supported.
 */
export function createHostAdapterForCloud(cloud: CloudProvider): HostAdapter {
  return createAwsHost();
}
