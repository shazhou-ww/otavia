import { isEnvRef, isSecretRef, isVarRef } from "../yaml/tags.js";
import { flattenVariablePaths, topologicalVariableOrder } from "./graph.js";

export type VariableEnvBinding = { logicalKey: string; envVarName: string };
export type VariableSecretBinding = { logicalKey: string; secretName: string };

export type ResolveTopVariablesResult = {
  /** Resolved string values per dotted logical key. */
  values: Record<string, string>;
  environments: VariableEnvBinding[];
  secrets: VariableSecretBinding[];
};

function requireEnv(processEnv: Record<string, string>, envVar: string, atPath: string): string {
  const v = processEnv[envVar];
  if (v === undefined) {
    throw new Error(
      `otavia.yaml variables at "${atPath}": environment variable "${envVar}" is not set`
    );
  }
  return v;
}

/**
 * Resolve top-level `variables` (spec §6.2 step 2): `!Var` graph + topo, `!Env`/`!Secret` bindings,
 * `!Var` targets not in tree read from `processEnv`.
 */
export function resolveTopVariables(
  variables: Record<string, unknown> | undefined,
  processEnv: Record<string, string>
): ResolveTopVariablesResult {
  if (variables == null || Object.keys(variables).length === 0) {
    return { values: {}, environments: [], secrets: [] };
  }

  const flat = flattenVariablePaths(variables);
  const order = topologicalVariableOrder(flat);

  const values: Record<string, string> = {};
  const environments: VariableEnvBinding[] = [];
  const secrets: VariableSecretBinding[] = [];

  for (const key of order) {
    const raw = flat.get(key);
    if (raw === undefined) continue;

    if (raw === null) {
      values[key] = "";
      continue;
    }
    if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
      values[key] = String(raw);
      continue;
    }
    if (typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`otavia.yaml variables: unsupported value at "${key}"`);
    }

    if (isEnvRef(raw)) {
      environments.push({ logicalKey: key, envVarName: raw.key });
      values[key] = requireEnv(processEnv, raw.key, key);
      continue;
    }
    if (isSecretRef(raw)) {
      secrets.push({ logicalKey: key, secretName: raw.key });
      values[key] = requireEnv(processEnv, raw.key, key);
      continue;
    }
    if (isVarRef(raw)) {
      if (flat.has(raw.key)) {
        values[key] = values[raw.key] ?? "";
      } else {
        values[key] = requireEnv(processEnv, raw.key, key);
      }
      continue;
    }

    throw new Error(`otavia.yaml variables: unsupported object at "${key}"`);
  }

  return { values, environments, secrets };
}
