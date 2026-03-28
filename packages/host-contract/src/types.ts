/**
 * Discriminator for which host implementation is active (matches otavia.yaml `cloud.provider`).
 */
export type ProviderId = "aws";

/** Declarative table (DynamoDB / Cosmos Table API) for deploy-time IaC and env injection. */
export interface DeployResourceTable {
  logicalId: string;
  partitionKeyAttr: string;
  rowKeyAttr: string;
  /** Segment for `OTAVIA_TABLE_${envSuffix}_*` env keys. */
  envSuffix: string;
}

/**
 * Payload passed to {@link HostAdapter.deployStack}.
 * Kept plain-data and free of `@otavia/stack` imports to avoid package cycles.
 */
export interface DeployInput {
  /** Absolute or normalized path to stack root (directory containing otavia.yaml). */
  stackRoot: string;
  /** Stack `name` from otavia.yaml. */
  stackName: string;
  /**
   * Provider placement: AWS uses `region` (spec §5.1).
   * Caller must supply the region for AWS.
   */
  provider: { region?: string };
  /** Resolved environment values for functions / app settings (from Stack `environments`). */
  environments: Record<string, string>;
  /**
   * Secret bindings from Stack `secrets`; host maps to SSM, etc.
   * Shape is intentionally loose at contract level — hosts narrow as needed.
   */
  secrets: Record<string, unknown>;
  /** When set, hosts provision portable row-store tables and inject `OTAVIA_TABLE_*` settings. */
  resourceTables?: DeployResourceTable[];
}

/**
 * Cloud-specific operations used by `@otavia/cli` (spec §4.1).
 */
export interface HostAdapter {
  readonly providerId: ProviderId;
  checkToolchain(): Promise<void>;
  checkCredentials(): Promise<void>;
  deployStack(input: DeployInput): Promise<void>;
}
