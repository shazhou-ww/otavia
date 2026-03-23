import { isParamRef, isVarRef } from "../yaml/tags.js";
import { flattenCellVariablePaths } from "./flatten-cell-variables.js";

function topologicalCellVarOrder(flat: Map<string, unknown>): string[] {
  const keys = [...flat.keys()];
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const k of keys) indegree.set(k, 0);

  for (const k of keys) {
    const v = flat.get(k);
    if (isVarRef(v)) {
      const target = v.key;
      if (flat.has(target)) {
        indegree.set(k, (indegree.get(k) ?? 0) + 1);
        const list = dependents.get(target) ?? [];
        list.push(k);
        dependents.set(target, list);
      }
    }
  }

  const queue = keys.filter((k) => (indegree.get(k) ?? 0) === 0).sort();
  const order: string[] = [];

  while (queue.length > 0) {
    const k = queue.shift()!;
    order.push(k);
    for (const d of dependents.get(k) ?? []) {
      const next = (indegree.get(d) ?? 0) - 1;
      indegree.set(d, next);
      if (next === 0) {
        queue.push(d);
        queue.sort();
      }
    }
  }

  if (order.length !== keys.length) {
    throw new Error("cell.yaml variables: cyclic !Var references");
  }

  return order;
}

function requireEnv(processEnv: Record<string, string>, envVar: string, atPath: string): string {
  const v = processEnv[envVar];
  if (v === undefined) {
    throw new Error(`cell.yaml variables at "${atPath}": environment variable "${envVar}" is not set`);
  }
  return v;
}

/**
 * Resolve cell `variables` (spec §6.2 step 5): `!Var` graph, `!Param` from merged stack params,
 * external `!Var` from `processEnv`.
 */
export function resolveCellVariables(
  variables: Record<string, unknown> | undefined,
  mergedStackParams: Record<string, string>,
  processEnv: Record<string, string>
): Record<string, string> {
  if (variables == null || Object.keys(variables).length === 0) {
    return {};
  }
  const flat = flattenCellVariablePaths(variables);
  const order = topologicalCellVarOrder(flat);
  const values: Record<string, string> = {};

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
      throw new Error(`cell.yaml variables: unsupported value at "${key}"`);
    }
    if (isParamRef(raw)) {
      const pk = raw.key;
      if (!Object.prototype.hasOwnProperty.call(mergedStackParams, pk)) {
        throw new Error(`cell.yaml variables at "${key}": !Param "${pk}" has no value from stack`);
      }
      values[key] = mergedStackParams[pk] ?? "";
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
    throw new Error(`cell.yaml variables: unsupported object at "${key}"`);
  }

  return values;
}
