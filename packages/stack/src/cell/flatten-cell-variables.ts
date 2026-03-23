import { isEnvRef, isParamRef, isSecretRef, isVarRef } from "../yaml/tags.js";

/**
 * Flatten cell `variables` mapping; `!Param` / `!Var` are leaves (unlike generic nesting).
 */
export function flattenCellVariablePaths(
  obj: Record<string, unknown>,
  prefix = ""
): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix === "" ? k : `${prefix}.${k}`;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      if (isEnvRef(v) || isSecretRef(v)) {
        throw new Error(`cell.yaml variables: !Env/!Secret not allowed at "${path}"`);
      }
      if (isVarRef(v) || isParamRef(v)) {
        out.set(path, v);
        continue;
      }
      for (const [p, val] of flattenCellVariablePaths(v as Record<string, unknown>, path)) {
        out.set(p, val);
      }
    } else {
      if (Array.isArray(v)) {
        throw new Error(`cell.yaml variables: arrays not supported at "${path}"`);
      }
      out.set(path, v);
    }
  }
  return out;
}
