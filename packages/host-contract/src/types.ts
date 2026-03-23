/**
 * Discriminator for which host implementation is active (matches otavia.yaml provider).
 */
export type ProviderId = "aws" | "azure";

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
   * Provider placement: AWS uses `region`, Azure uses `location` (spec §5.1).
   * Caller must supply the correct shape for the active provider.
   */
  provider: { region?: string; location?: string };
  /** Resolved environment values for functions / app settings (from Stack `environments`). */
  environments: Record<string, string>;
  /**
   * Secret bindings from Stack `secrets`; host maps to SSM, Key Vault, etc.
   * Shape is intentionally loose at contract level — hosts narrow as needed.
   */
  secrets: Record<string, unknown>;
  /**
   * Azure: target resource group for `az deployment group create`.
   * Required when deploying with {@link HostAdapter} `providerId` `"azure"`.
   */
  resourceGroup?: string;
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
