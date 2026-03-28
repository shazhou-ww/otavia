import type { CloudProvider, StackResourceTable } from "../types.js";
import { parseYamlWithOtaviaTags } from "../yaml/load-yaml.js";
import { validateOtaviaTagZones } from "./validate-otavia-tag-zones.js";

const KNOWN_TOP_LEVEL = new Set(["name", "cloud", "variables", "cells", "domain", "resources"]);

const DEFAULT_SCOPE = "@otavia";

export type OtaviaCellsListItem = {
  mount: string;
  package: string;
  params?: Record<string, unknown>;
};

export type ParsedOtaviaYaml = {
  name: string;
  cloud: CloudProvider;
  variables?: Record<string, unknown>;
  /** mount -> package name */
  cells: Record<string, string>;
  cellsList: OtaviaCellsListItem[];
  domain?: Record<string, unknown>;
  /** `resources.tables` — logical id → partition/sort attribute names (v1: string keys only). */
  resourceTables: Record<string, StackResourceTable>;
  warnings: string[];
};

function normalizeParams(value: unknown, pathLabel: string): Record<string, unknown> | undefined {
  if (value == null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${pathLabel} must be an object`);
  }
  return value as Record<string, unknown>;
}

function packageToMount(packageName: string): string {
  const trimmed = packageName.trim();
  if (trimmed.length === 0) return trimmed;
  const parts = trimmed.split("/");
  return trimmed.startsWith("@") ? (parts[1] ?? "") : (parts[0] ?? "");
}

function parseCells(data: unknown): { cells: Record<string, string>; cellsList: OtaviaCellsListItem[] } {
  if (data == null) {
    throw new Error("otavia.yaml: missing cells");
  }
  if (Array.isArray(data)) {
    if (data.length === 0) {
      throw new Error("otavia.yaml: cells must be a non-empty array or object");
    }
    const cellsList: OtaviaCellsListItem[] = [];
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      const itemPath = `otavia.yaml: cells[${i}]`;
      if (typeof item === "string") {
        const mount = item.trim();
        if (!mount) throw new Error(`${itemPath} must be a non-empty string`);
        cellsList.push({ mount, package: `${DEFAULT_SCOPE}/${mount}` });
        continue;
      }
      if (item == null || typeof item !== "object" || Array.isArray(item)) {
        throw new Error(`${itemPath} must be a string or an object { package, mount?, params? }`);
      }
      const record = item as Record<string, unknown>;
      const packageName = typeof record.package === "string" ? record.package.trim() : "";
      if (!packageName) throw new Error(`${itemPath}.package must be a non-empty string`);
      const mount =
        typeof record.mount === "string" && record.mount.trim()
          ? record.mount.trim()
          : packageToMount(packageName);
      if (!mount) throw new Error(`${itemPath}.mount is required when package cannot infer mount`);
      const params = normalizeParams(record.params, `${itemPath}.params`);
      cellsList.push({ mount, package: packageName, params });
    }
    const cells = Object.fromEntries(cellsList.map((c) => [c.mount, c.package]));
    return { cells, cellsList };
  }
  if (typeof data === "object" && !Array.isArray(data)) {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) {
      throw new Error("otavia.yaml: cells object must have at least one entry");
    }
    const cellsList: OtaviaCellsListItem[] = [];
    for (const [mountRaw, cellDef] of entries) {
      const mount = mountRaw.trim();
      if (typeof mount !== "string" || mount === "") {
        throw new Error("otavia.yaml: cells keys (mount) must be non-empty strings");
      }
      if (typeof cellDef === "string") {
        const packageName = cellDef.trim();
        if (!packageName) {
          throw new Error(`otavia.yaml: cells["${mount}"] must be a non-empty package name string`);
        }
        cellsList.push({ mount, package: packageName });
        continue;
      }
      if (cellDef == null || typeof cellDef !== "object" || Array.isArray(cellDef)) {
        throw new Error(
          `otavia.yaml: cells["${mount}"] must be a package string or object { package, params? }`
        );
      }
      const record = cellDef as Record<string, unknown>;
      const packageName = typeof record.package === "string" ? record.package.trim() : "";
      if (!packageName) {
        throw new Error(`otavia.yaml: cells["${mount}"].package must be a non-empty string`);
      }
      const params = normalizeParams(record.params, `otavia.yaml: cells["${mount}"].params`);
      cellsList.push({ mount, package: packageName, params });
    }
    const cells = Object.fromEntries(cellsList.map((c) => [c.mount, c.package]));
    return { cells, cellsList };
  }
  throw new Error("otavia.yaml: cells must be an array or an object");
}

export function providerKind(cloud: CloudProvider): "aws" {
  return "aws";
}

function parseCloud(data: Record<string, unknown>): CloudProvider {
  const v = data.cloud;
  if (v == null || typeof v !== "object" || Array.isArray(v)) {
    throw new Error('otavia.yaml: "cloud" must be an object');
  }
  const o = v as Record<string, unknown>;
  const id = o.provider;
  if (id !== "aws") {
    throw new Error('otavia.yaml: cloud.provider must be "aws"');
  }
  const region = typeof o.region === "string" ? o.region.trim() : "";
  if (!region) {
    throw new Error('otavia.yaml: cloud (aws) must include non-empty "region"');
  }
  const location = typeof o.location === "string" ? o.location.trim() : "";
  if (location) {
    throw new Error('otavia.yaml: cloud must not set "location" when provider is "aws"');
  }
  return { provider: "aws", region };
}

const ATTR_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function parseResourceTables(
  resources: Record<string, unknown>,
  warnings: string[]
): Record<string, StackResourceTable> {
  for (const key of Object.keys(resources)) {
    if (key !== "tables") {
      warnings.push(`Unknown resources key "${key}" (ignored)`);
    }
  }
  const raw = resources.tables;
  if (raw == null) {
    return {};
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error('otavia.yaml: resources.tables must be an object when present');
  }
  const out: Record<string, StackResourceTable> = {};
  for (const [logicalIdRaw, def] of Object.entries(raw as Record<string, unknown>)) {
    const logicalId = logicalIdRaw.trim();
    if (!logicalId) {
      throw new Error("otavia.yaml: resources.tables keys must be non-empty logical table ids");
    }
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(logicalId)) {
      throw new Error(
        `otavia.yaml: resources.tables key "${logicalIdRaw}" must match /^[a-zA-Z][a-zA-Z0-9_-]*$/`
      );
    }
    if (def == null || typeof def !== "object" || Array.isArray(def)) {
      throw new Error(`otavia.yaml: resources.tables["${logicalId}"] must be an object`);
    }
    const o = def as Record<string, unknown>;
    const pk = typeof o.partitionKey === "string" ? o.partitionKey.trim() : "";
    const rk = typeof o.rowKey === "string" ? o.rowKey.trim() : "";
    if (!pk || !ATTR_NAME.test(pk)) {
      throw new Error(
        `otavia.yaml: resources.tables["${logicalId}"].partitionKey must be a valid attribute name`
      );
    }
    if (!rk || !ATTR_NAME.test(rk)) {
      throw new Error(
        `otavia.yaml: resources.tables["${logicalId}"].rowKey must be a valid attribute name`
      );
    }
    if (pk === rk) {
      throw new Error(
        `otavia.yaml: resources.tables["${logicalId}"]: partitionKey and rowKey must differ`
      );
    }
    for (const k of Object.keys(o)) {
      if (k !== "partitionKey" && k !== "rowKey") {
        warnings.push(`Unknown key resources.tables["${logicalId}"].${k} (ignored)`);
      }
    }
    out[logicalId] = { partitionKey: pk, rowKey: rk };
  }
  return out;
}

function parseName(data: Record<string, unknown>): string {
  const v = data.name;
  if (v == null || v === "") {
    throw new Error('otavia.yaml: missing "name"');
  }
  if (typeof v !== "string" || !v.trim()) {
    throw new Error('otavia.yaml: "name" must be a non-empty string');
  }
  return v.trim();
}

/**
 * Parse `otavia.yaml` text: custom tags, structural fields, tag-zone rules (spec §6.1),
 * and collect warnings for unknown top-level keys (spec §6.4).
 */
export function parseOtaviaYaml(content: string): ParsedOtaviaYaml {
  const raw = parseYamlWithOtaviaTags(content);
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("otavia.yaml: root must be a mapping");
  }
  const data = raw as Record<string, unknown>;

  validateOtaviaTagZones(data);

  const warnings: string[] = [];
  for (const key of Object.keys(data)) {
    if (!KNOWN_TOP_LEVEL.has(key)) {
      warnings.push(`Unknown top-level key "${key}" (ignored)`);
    }
  }

  const name = parseName(data);
  const cloud = parseCloud(data);

  let variables: Record<string, unknown> | undefined;
  if (data.variables != null) {
    if (typeof data.variables !== "object" || Array.isArray(data.variables)) {
      throw new Error('otavia.yaml: "variables" must be an object when present');
    }
    variables = data.variables as Record<string, unknown>;
  }

  const { cells, cellsList } = parseCells(data.cells);

  let domain: Record<string, unknown> | undefined;
  if (data.domain != null) {
    if (typeof data.domain !== "object" || Array.isArray(data.domain)) {
      throw new Error('otavia.yaml: "domain" must be an object when present');
    }
    domain = data.domain as Record<string, unknown>;
  }

  let resourceTables: Record<string, StackResourceTable> = {};
  if (data.resources != null) {
    if (typeof data.resources !== "object" || Array.isArray(data.resources)) {
      throw new Error('otavia.yaml: "resources" must be an object when present');
    }
    resourceTables = parseResourceTables(data.resources as Record<string, unknown>, warnings);
  }

  return { name, cloud, variables, cells, cellsList, domain, resourceTables, warnings };
}
