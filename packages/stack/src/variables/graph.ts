import { isEnvRef, isSecretRef, isVarRef } from "../yaml/tags.js";

/**
 * Flatten `variables` mapping to dotted paths (`a`, `b.c`) → leaf value.
 * Leaf values: primitives, null, or `!Env` / `!Secret` / `!Var` tag objects.
 */
export function flattenVariablePaths(
  obj: Record<string, unknown>,
  prefix = ""
): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix === "" ? k : `${prefix}.${k}`;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      if (isEnvRef(v) || isSecretRef(v) || isVarRef(v)) {
        out.set(path, v);
        continue;
      }
      for (const [p, val] of flattenVariablePaths(v as Record<string, unknown>, path)) {
        out.set(p, val);
      }
    } else {
      if (Array.isArray(v)) {
        throw new Error(`otavia.yaml variables: arrays are not supported at "${path}"`);
      }
      out.set(path, v);
    }
  }
  return out;
}

/**
 * Kahn topological order of variable keys. For each `!Var` whose target exists in `flat`,
 * add edge target → dependent (target must be resolved first).
 * Throws if a cycle exists among internal `!Var` references.
 */
export function topologicalVariableOrder(flat: Map<string, unknown>): string[] {
  const keys = [...flat.keys()];
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const k of keys) {
    indegree.set(k, 0);
  }

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
    throw new Error("otavia.yaml variables: cyclic !Var references");
  }

  return order;
}
