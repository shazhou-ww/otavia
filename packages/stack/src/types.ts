import type { DeployParams } from "./otavia/parse-otavia-yaml.js";
import type { VariableEnvBinding, VariableSecretBinding } from "./variables/resolve-top-variables.js";

/** `resources.tables.<logicalId>` from `otavia.yaml` (portable row store v1). */
export type StackResourceTable = {
  partitionKey: string;
  rowKey: string;
};

/** AWS cloud configuration for `otavia.yaml` `cloud`. */
export type CloudAws = { provider: "aws"; region: string };
export type CloudProvider = CloudAws;

export type StackCellModel = {
  mount: string;
  packageName: string;
  packageRootAbs: string;
  name: string;
  mergedStackParams: Record<string, string>;
  cellVariableValues: Record<string, string>;
  backend?: unknown;
  frontend?: unknown;
  /** Merged deploy params: otavia.yaml defaults ← per-cell overrides. */
  deploy?: DeployParams;
};

export type StackModel = {
  stackRootAbs: string;
  workspaceRootAbs: string;
  name: string;
  providerKind: "aws";
  cloud: CloudProvider;
  topLevelVariableValues: Record<string, string>;
  environments: VariableEnvBinding[];
  secrets: VariableSecretBinding[];
  /** `cells` mounts in `otavia.yaml` declaration order. */
  cellMountOrder: string[];
  cells: Record<string, StackCellModel>;
  /** Logical table id → key attribute names (empty if not declared). */
  resourceTables: Record<string, StackResourceTable>;
  /** Stack-level deploy defaults from otavia.yaml `defaults`. */
  defaults?: DeployParams;
  warnings: string[];
};
