import { readFileSync } from "node:fs";
import path from "node:path";
import { parseDocument } from "yaml";
import type { CellConfig } from "./cell-yaml-schema";

const OAUTH_ROLES = new Set(["resource_server", "authorization_server", "both"]);

/**
 * Load and parse cell.yaml from cellDir.
 * cell.yaml should only declare required param keys; !Env/!Secret are not supported here.
 */
export function loadCellConfig(cellDir: string): CellConfig {
  const filePath = path.join(cellDir, "cell.yaml");
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read cell.yaml: ${message}`);
  }

  if (/(^|[\s:[{,])!(Env|Secret)\b/m.test(content)) {
    throw new Error("cell.yaml: !Env and !Secret are not supported; move refs to otavia.yaml params");
  }

  const doc = parseDocument(content);
  const raw = doc.toJS() as Record<string, unknown> | null | undefined;

  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("cell.yaml: invalid YAML or empty document");
  }

  const name = raw.name;
  if (name == null) {
    throw new Error("cell.yaml: missing required field 'name'");
  }
  if (typeof name !== "string" || name.trim() === "") {
    throw new Error("cell.yaml: 'name' must be a non-empty string");
  }

  if (raw.params != null) {
    if (!Array.isArray(raw.params)) {
      throw new Error("cell.yaml: 'params' must be an array of strings");
    }
    for (let i = 0; i < raw.params.length; i += 1) {
      if (typeof raw.params[i] !== "string" || raw.params[i].trim() === "") {
        throw new Error(`cell.yaml: params[${i}] must be a non-empty string`);
      }
    }
  }

  if (raw.oauth != null) {
    if (typeof raw.oauth !== "object" || Array.isArray(raw.oauth)) {
      throw new Error("cell.yaml: 'oauth' must be an object");
    }
    const oauth = raw.oauth as Record<string, unknown>;
    if ("issuerPath" in oauth) {
      throw new Error("cell.yaml: 'oauth.issuerPath' is not supported in v1; issuer path is derived from mount");
    }
    if ("discovery" in oauth) {
      throw new Error("cell.yaml: 'oauth.discovery' is not supported in v1; discovery is automatic for oauth-enabled cells");
    }

    if (typeof oauth.enabled !== "boolean") {
      throw new Error("cell.yaml: 'oauth.enabled' must be a boolean");
    }
    if (typeof oauth.role !== "string" || !OAUTH_ROLES.has(oauth.role)) {
      throw new Error(
        "cell.yaml: 'oauth.role' must be one of: resource_server, authorization_server, both"
      );
    }
    if (!Array.isArray(oauth.scopes)) {
      throw new Error("cell.yaml: 'oauth.scopes' must be an array of strings");
    }
    for (let i = 0; i < oauth.scopes.length; i += 1) {
      const scope = oauth.scopes[i];
      if (typeof scope !== "string" || scope.trim() === "") {
        throw new Error(`cell.yaml: oauth.scopes[${i}] must be a non-empty string`);
      }
    }
    if (oauth.enabled && oauth.scopes.length === 0) {
      throw new Error("cell.yaml: 'oauth.scopes' must be a non-empty array of strings when oauth.enabled is true");
    }
  }

  function assertRoutesArray(labelBase: string, routes: unknown): void {
    if (!Array.isArray(routes)) {
      throw new Error(`${labelBase} must be an array of strings (use [] if none)`);
    }
    for (let i = 0; i < routes.length; i += 1) {
      const r = routes[i];
      if (typeof r !== "string" || r.trim() === "") {
        throw new Error(`${labelBase}[${i}] must be a non-empty string`);
      }
    }
  }

  if (raw.backend != null) {
    if (typeof raw.backend !== "object" || Array.isArray(raw.backend)) {
      throw new Error("cell.yaml: 'backend' must be an object");
    }
    const be = raw.backend as Record<string, unknown>;
    if (be.entries != null) {
      if (typeof be.entries !== "object" || Array.isArray(be.entries)) {
        throw new Error("cell.yaml: backend.entries must be an object");
      }
      for (const [key, ent] of Object.entries(be.entries as Record<string, unknown>)) {
        if (ent == null || typeof ent !== "object" || Array.isArray(ent)) {
          throw new Error(`cell.yaml: backend.entries.${key} must be an object`);
        }
        const e = ent as Record<string, unknown>;
        if (!("routes" in e)) {
          throw new Error(`cell.yaml: backend.entries.${key}.routes is required (use [] if none)`);
        }
        assertRoutesArray(`cell.yaml: backend.entries.${key}.routes`, e.routes);
      }
    }
  }

  if (raw.frontend != null) {
    if (typeof raw.frontend !== "object" || Array.isArray(raw.frontend)) {
      throw new Error("cell.yaml: 'frontend' must be an object");
    }
    const fe = raw.frontend as Record<string, unknown>;
    if (fe.entries != null) {
      if (typeof fe.entries !== "object" || Array.isArray(fe.entries)) {
        throw new Error("cell.yaml: frontend.entries must be an object");
      }
      for (const [key, ent] of Object.entries(fe.entries as Record<string, unknown>)) {
        if (ent == null || typeof ent !== "object" || Array.isArray(ent)) {
          throw new Error(`cell.yaml: frontend.entries.${key} must be an object`);
        }
        const e = ent as Record<string, unknown>;
        if (!("routes" in e)) {
          throw new Error(`cell.yaml: frontend.entries.${key}.routes is required (use [] if none)`);
        }
        assertRoutesArray(`cell.yaml: frontend.entries.${key}.routes`, e.routes);
      }
    }
  }

  if (raw.appsyncEvents != null) {
    if (typeof raw.appsyncEvents !== "object" || Array.isArray(raw.appsyncEvents)) {
      throw new Error("cell.yaml: 'appsyncEvents' must be an object");
    }
    const ae = raw.appsyncEvents as Record<string, unknown>;
    if (typeof ae.enabled !== "boolean") {
      throw new Error("cell.yaml: 'appsyncEvents.enabled' must be a boolean");
    }
    if (ae.namespace != null) {
      if (typeof ae.namespace !== "string" || ae.namespace.trim() === "") {
        throw new Error("cell.yaml: 'appsyncEvents.namespace' must be a non-empty string");
      }
      const ns = ae.namespace.trim();
      if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,48}[A-Za-z0-9])?$/.test(ns)) {
        throw new Error(
          "cell.yaml: 'appsyncEvents.namespace' must be 1–50 chars (letters, numbers, hyphens) per AppSync rules"
        );
      }
    }
  }

  return raw as unknown as CellConfig;
}
