import { parseYamlWithOtaviaTags } from "../yaml/load-yaml.js";
import { validateOtaviaTagZones } from "./validate-otavia-tag-zones.js";

const KNOWN_TOP_LEVEL = new Set(["name", "provider", "variables", "cells", "domain"]);

const DEFAULT_SCOPE = "@otavia";

export type OtaviaCellsListItem = {
  mount: string;
  package: string;
  params?: Record<string, unknown>;
};

export type ParsedOtaviaYaml = {
  name: string;
  provider: Record<string, unknown>;
  variables?: Record<string, unknown>;
  /** mount -> package name */
  cells: Record<string, string>;
  cellsList: OtaviaCellsListItem[];
  domain?: Record<string, unknown>;
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

export function providerKind(provider: Record<string, unknown>): "aws" | "azure" {
  const region =
    typeof provider.region === "string" && provider.region.trim() !== ""
      ? provider.region.trim()
      : "";
  const location =
    typeof provider.location === "string" && provider.location.trim() !== ""
      ? provider.location.trim()
      : "";
  if (region && !location) return "aws";
  if (location && !region) return "azure";
  if (region && location) {
    throw new Error('otavia.yaml: provider cannot set both "region" and "location"');
  }
  throw new Error('otavia.yaml: provider must include "region" (AWS) or "location" (Azure)');
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

function parseProvider(data: Record<string, unknown>): Record<string, unknown> {
  const v = data.provider;
  if (v == null || typeof v !== "object" || Array.isArray(v)) {
    throw new Error('otavia.yaml: "provider" must be an object');
  }
  return v as Record<string, unknown>;
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
  const provider = parseProvider(data);
  providerKind(provider);

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

  return { name, provider, variables, cells, cellsList, domain, warnings };
}
