import { isEnvRef, isParamRef, isSecretRef, isVarRef } from "../yaml/tags.js";

/**
 * Substitute `cells[mount].params` using resolved top-level `variables` values.
 * Spec: only `!Var` allowed; target must be a key in `topVariableValues`.
 * `!Param`, `!Env`, `!Secret` are rejected.
 */
export function resolveCellMountParams(
  params: Record<string, unknown> | undefined,
  topVariableValues: Record<string, string>
): Record<string, string> {
  if (params == null || Object.keys(params).length === 0) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(params)) {
    out[key] = String(resolveMountParamValue(raw, key, topVariableValues));
  }
  return out;
}

function resolveMountParamValue(
  value: unknown,
  path: string,
  topVariableValues: Record<string, string>
): string | number | boolean {
  if (value === null || value === undefined) {
    throw new Error(`otavia.yaml cells[mount].params.${path}: value is required`);
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`otavia.yaml cells[mount].params.${path}: unsupported value type`);
  }
  if (isParamRef(value)) {
    throw new Error(`otavia.yaml cells[mount].params.${path}: !Param is not allowed`);
  }
  if (isEnvRef(value) || isSecretRef(value)) {
    throw new Error(
      `otavia.yaml cells[mount].params.${path}: !Env/!Secret are not allowed (use !Var to reference top-level variables)`
    );
  }
  if (isVarRef(value)) {
    const target = value.key;
    if (!Object.prototype.hasOwnProperty.call(topVariableValues, target)) {
      throw new Error(
        `otavia.yaml cells[mount].params.${path}: !Var "${target}" is not a top-level variables key`
      );
    }
    return topVariableValues[target] ?? "";
  }
  throw new Error(`otavia.yaml cells[mount].params.${path}: unsupported tagged object`);
}
