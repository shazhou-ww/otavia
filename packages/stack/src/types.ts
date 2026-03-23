import type { VariableEnvBinding, VariableSecretBinding } from "./variables/resolve-top-variables.js";

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
  provider: Record<string, unknown>;
  topLevelVariableValues: Record<string, string>;
  environments: VariableEnvBinding[];
  secrets: VariableSecretBinding[];
  cells: Record<string, StackCellModel>;
  warnings: string[];
};
