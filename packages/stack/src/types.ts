import type { VariableEnvBinding, VariableSecretBinding } from "./variables/resolve-top-variables.js";

/** Discriminated union for `otavia.yaml` `cloud` (MVP: aws | azure). */
export type CloudAws = { provider: "aws"; region: string };
export type CloudAzure = { provider: "azure"; location: string };
export type CloudProvider = CloudAws | CloudAzure;

export type StackCellModel = {
  mount: string;
  packageName: string;
  packageRootAbs: string;
  name: string;
  mergedStackParams: Record<string, string>;
  cellVariableValues: Record<string, string>;
  backend?: unknown;
  frontend?: unknown;
};

export type StackModel = {
  stackRootAbs: string;
  workspaceRootAbs: string;
  name: string;
  providerKind: "aws" | "azure";
  cloud: CloudProvider;
  topLevelVariableValues: Record<string, string>;
  environments: VariableEnvBinding[];
  secrets: VariableSecretBinding[];
  /** `cells` mounts in `otavia.yaml` declaration order. */
  cellMountOrder: string[];
  cells: Record<string, StackCellModel>;
  warnings: string[];
};
