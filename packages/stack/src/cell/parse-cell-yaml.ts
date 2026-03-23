import { isEnvRef, isSecretRef } from "../yaml/tags.js";
import { parseYamlWithOtaviaTags } from "../yaml/load-yaml.js";

const KNOWN_TOP_LEVEL = new Set(["name", "params", "variables", "backend", "frontend"]);

function assertNoEnvOrSecretInTree(node: unknown, path: string): void {
  if (node === null || node === undefined) return;
  if (typeof node !== "object") return;
  if (isEnvRef(node) || isSecretRef(node)) {
    throw new Error(
      `cell.yaml${path ? ` at ${path}` : ""}: !Env and !Secret are not allowed in cell.yaml`
    );
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      assertNoEnvOrSecretInTree(node[i], `${path}[${i}]`);
    }
    return;
  }
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    assertNoEnvOrSecretInTree(v, path === "" ? k : `${path}.${k}`);
  }
}

export type ParsedCellYaml = {
  name: string;
  params: string[];
  variables?: Record<string, unknown>;
  backend?: Record<string, unknown>;
  frontend?: Record<string, unknown>;
  warnings: string[];
};

/**
 * Parse `cell.yaml` text with Otavia tags; forbid `!Env` / `!Secret` everywhere (spec §6.1).
 */
export function parseCellYaml(content: string): ParsedCellYaml {
  const raw = parseYamlWithOtaviaTags(content);
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("cell.yaml: root must be a mapping");
  }
  const data = raw as Record<string, unknown>;

  assertNoEnvOrSecretInTree(data, "");

  const warnings: string[] = [];
  for (const key of Object.keys(data)) {
    if (!KNOWN_TOP_LEVEL.has(key)) {
      warnings.push(`Unknown cell.yaml top-level key "${key}" (ignored)`);
    }
  }

  const name = data.name;
  if (name == null || typeof name !== "string" || !name.trim()) {
    throw new Error("cell.yaml: missing non-empty string field 'name'");
  }

  let params: string[] = [];
  if (data.params != null) {
    if (!Array.isArray(data.params)) {
      throw new Error("cell.yaml: 'params' must be an array of strings");
    }
    for (let i = 0; i < data.params.length; i++) {
      const p = data.params[i];
      if (typeof p !== "string" || !p.trim()) {
        throw new Error(`cell.yaml: params[${i}] must be a non-empty string`);
      }
      params.push(p.trim());
    }
  }

  let variables: Record<string, unknown> | undefined;
  if (data.variables != null) {
    if (typeof data.variables !== "object" || Array.isArray(data.variables)) {
      throw new Error("cell.yaml: 'variables' must be an object when present");
    }
    variables = data.variables as Record<string, unknown>;
  }

  let backend: Record<string, unknown> | undefined;
  if (data.backend != null) {
    if (typeof data.backend !== "object" || Array.isArray(data.backend)) {
      throw new Error("cell.yaml: 'backend' must be an object when present");
    }
    backend = data.backend as Record<string, unknown>;
  }

  let frontend: Record<string, unknown> | undefined;
  if (data.frontend != null) {
    if (typeof data.frontend !== "object" || Array.isArray(data.frontend)) {
      throw new Error("cell.yaml: 'frontend' must be an object when present");
    }
    frontend = data.frontend as Record<string, unknown>;
  }

  return {
    name: name.trim(),
    params,
    variables,
    backend,
    frontend,
    warnings,
  };
}
