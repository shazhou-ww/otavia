import { isEnvRef, isSecretRef } from "../yaml/tags.js";
import { parseYamlWithOtaviaTags } from "../yaml/load-yaml.js";

const KNOWN_TOP_LEVEL = new Set(["name", "params", "backend", "frontend", "tables", "oauth"]);

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
  backend?: Record<string, unknown>;
  frontend?: Record<string, unknown>;
  tables?: Record<string, unknown>;
  oauth?: Record<string, unknown>;
  warnings: string[];
};

const DEPLOY_ONLY_KEYS = new Set(["timeout", "memory", "memorySize", "concurrency", "layers", "vpc"]);
const ALLOWED_ENTRY_KEYS = new Set(["handler", "routes"]);

function validateBackendEntries(backend: Record<string, unknown>, warnings: string[]): void {
  const entries = backend.entries;
  if (entries == null) return;
  if (typeof entries !== "object" || Array.isArray(entries)) return;
  for (const [entryName, entryVal] of Object.entries(entries as Record<string, unknown>)) {
    if (entryVal == null || typeof entryVal !== "object" || Array.isArray(entryVal)) continue;
    for (const key of Object.keys(entryVal as Record<string, unknown>)) {
      if (DEPLOY_ONLY_KEYS.has(key)) {
        throw new Error(
          `cell.yaml: backend.entries.${entryName}.${key} is a deploy-time parameter and must not appear in cell.yaml`
        );
      }
      if (!ALLOWED_ENTRY_KEYS.has(key)) {
        warnings.push(
          `backend.entries.${entryName}: unknown key "${key}" (only handler and routes are allowed)`
        );
      }
    }
  }
}

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

  let backend: Record<string, unknown> | undefined;
  if (data.backend != null) {
    if (typeof data.backend !== "object" || Array.isArray(data.backend)) {
      throw new Error("cell.yaml: 'backend' must be an object when present");
    }
    backend = data.backend as Record<string, unknown>;
    validateBackendEntries(backend, warnings);
  }

  let frontend: Record<string, unknown> | undefined;
  if (data.frontend != null) {
    if (typeof data.frontend !== "object" || Array.isArray(data.frontend)) {
      throw new Error("cell.yaml: 'frontend' must be an object when present");
    }
    frontend = data.frontend as Record<string, unknown>;
  }

  let tables: Record<string, unknown> | undefined;
  if (data.tables != null) {
    if (typeof data.tables !== "object" || Array.isArray(data.tables)) {
      throw new Error("cell.yaml: 'tables' must be an object when present");
    }
    tables = data.tables as Record<string, unknown>;
  }

  let oauth: Record<string, unknown> | undefined;
  if (data.oauth != null) {
    if (typeof data.oauth !== "object" || Array.isArray(data.oauth)) {
      throw new Error("cell.yaml: 'oauth' must be an object when present");
    }
    oauth = data.oauth as Record<string, unknown>;
  }

  return {
    name: name.trim(),
    params,
    backend,
    frontend,
    tables,
    oauth,
    warnings,
  };
}
