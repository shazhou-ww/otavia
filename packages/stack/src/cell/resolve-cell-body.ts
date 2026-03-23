import { isParamRef, isVarRef } from "../yaml/tags.js";

/**
 * Expand `!Param` / `!Var` in `backend` and `frontend` trees (spec §6.2 step 6).
 */
export function resolveCellBodyFields(
  backend: unknown,
  frontend: unknown,
  mergedStackParams: Record<string, string>,
  cellVariableValues: Record<string, string>
): { backend?: unknown; frontend?: unknown } {
  return {
    backend:
      backend == null
        ? undefined
        : resolveNode(backend, mergedStackParams, cellVariableValues, "backend"),
    frontend:
      frontend == null
        ? undefined
        : resolveNode(frontend, mergedStackParams, cellVariableValues, "frontend"),
  };
}

function resolveNode(
  node: unknown,
  mergedStackParams: Record<string, string>,
  cellVariableValues: Record<string, string>,
  path: string
): unknown {
  if (node === null || node === undefined) return node;
  if (typeof node !== "object") return node;
  if (isParamRef(node)) {
    const v = mergedStackParams[node.key];
    if (v === undefined) {
      throw new Error(`${path}: !Param "${node.key}" has no value from stack`);
    }
    return v;
  }
  if (isVarRef(node)) {
    const v = cellVariableValues[node.key];
    if (v === undefined) {
      throw new Error(`${path}: !Var "${node.key}" is not defined in cell variables`);
    }
    return v;
  }
  if (Array.isArray(node)) {
    return node.map((item, i) =>
      resolveNode(item, mergedStackParams, cellVariableValues, `${path}[${i}]`)
    );
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    out[k] = resolveNode(v, mergedStackParams, cellVariableValues, `${path}.${k}`);
  }
  return out;
}
