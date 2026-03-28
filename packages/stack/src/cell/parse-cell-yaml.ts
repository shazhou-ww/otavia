import { isEnvRef, isSecretRef } from "../yaml/tags.js";
import { parseYamlWithOtaviaTags } from "../yaml/load-yaml.js";

const KNOWN_TOP_LEVEL = new Set(["name", "params", "backend", "frontend", "tables", "oauth", "variables", "buckets", "testing"]);

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
  oauth?: { scopes: string[] };
  variables?: Record<string, string>;
  buckets?: Record<string, unknown>;
  testing?: Record<string, unknown>;
  warnings: string[];
};

const DEPLOY_ONLY_KEYS = new Set(["timeout", "memory", "memorySize", "concurrency", "layers", "vpc"]);
const ALLOWED_ENTRY_KEYS = new Set(["entry", "routes"]);

function validateEntries(
  section: "backend" | "frontend",
  obj: Record<string, unknown>,
  warnings: string[]
): void {
  const entries = obj.entries;
  if (entries == null) return;
  if (typeof entries !== "object" || Array.isArray(entries)) return;
  for (const [entryName, entryVal] of Object.entries(entries as Record<string, unknown>)) {
    if (entryVal == null || typeof entryVal !== "object" || Array.isArray(entryVal)) continue;
    for (const key of Object.keys(entryVal as Record<string, unknown>)) {
      if (DEPLOY_ONLY_KEYS.has(key)) {
        throw new Error(
          `cell.yaml: ${section}.entries.${entryName}.${key} is a deploy-time parameter and must not appear in cell.yaml`
        );
      }
      if (!ALLOWED_ENTRY_KEYS.has(key)) {
        warnings.push(
          `${section}.entries.${entryName}: unknown key "${key}" (only entry and routes are allowed)`
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
    if (backend.dir != null && typeof backend.dir !== "string") {
      throw new Error("cell.yaml: 'backend.dir' must be a string when present");
    }
    validateEntries("backend", backend, warnings);
  }

  let frontend: Record<string, unknown> | undefined;
  if (data.frontend != null) {
    if (typeof data.frontend !== "object" || Array.isArray(data.frontend)) {
      throw new Error("cell.yaml: 'frontend' must be an object when present");
    }
    frontend = data.frontend as Record<string, unknown>;
    validateEntries("frontend", frontend, warnings);
  }

  let tables: Record<string, unknown> | undefined;
  if (data.tables != null) {
    if (typeof data.tables !== "object" || Array.isArray(data.tables)) {
      throw new Error("cell.yaml: 'tables' must be an object when present");
    }
    tables = data.tables as Record<string, unknown>;
  }

  let oauth: { scopes: string[] } | undefined;
  if (data.oauth != null) {
    if (typeof data.oauth !== "object" || Array.isArray(data.oauth)) {
      throw new Error("cell.yaml: 'oauth' must be an object when present");
    }
    const oauthData = data.oauth as Record<string, unknown>;
    if (!Array.isArray(oauthData.scopes)) {
      throw new Error("cell.yaml: 'oauth.scopes' must be an array of strings");
    }
    for (let i = 0; i < oauthData.scopes.length; i++) {
      if (typeof oauthData.scopes[i] !== "string") {
        throw new Error(`cell.yaml: oauth.scopes[${i}] must be a string`);
      }
    }
    const unknownOauthKeys = Object.keys(oauthData).filter((k) => k !== "scopes");
    for (const k of unknownOauthKeys) {
      warnings.push(`oauth: unknown key "${k}" (only scopes is allowed)`);
    }
    oauth = { scopes: oauthData.scopes as string[] };
  }

  let variables: Record<string, string> | undefined;
  if (data.variables != null) {
    if (typeof data.variables !== "object" || Array.isArray(data.variables)) {
      throw new Error("cell.yaml: 'variables' must be an object when present");
    }
    const rawVars = data.variables as Record<string, unknown>;
    for (const [k, v] of Object.entries(rawVars)) {
      if (typeof v !== "string") {
        throw new Error(`cell.yaml: variables.${k} must be a string`);
      }
    }
    variables = rawVars as Record<string, string>;
  }

  let buckets: Record<string, unknown> | undefined;
  if (data.buckets != null) {
    if (typeof data.buckets !== "object" || Array.isArray(data.buckets)) {
      throw new Error("cell.yaml: 'buckets' must be an object when present");
    }
    buckets = data.buckets as Record<string, unknown>;
  }

  let testing: Record<string, unknown> | undefined;
  if (data.testing != null) {
    if (typeof data.testing !== "object" || Array.isArray(data.testing)) {
      throw new Error("cell.yaml: 'testing' must be an object when present");
    }
    testing = data.testing as Record<string, unknown>;
  }

  return {
    name: name.trim(),
    params,
    backend,
    frontend,
    tables,
    oauth,
    variables,
    buckets,
    testing,
    warnings,
  };
}
