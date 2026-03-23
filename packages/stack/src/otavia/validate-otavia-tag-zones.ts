import { isEnvRef, isParamRef, isSecretRef, isVarRef } from "../yaml/tags.js";

/** Where Otavia YAML tags are allowed (spec §6.1). */
type TagZone = "none" | "topVariables" | "cellsParams";

function tagError(path: string, msg: string): Error {
  return new Error(`otavia.yaml${path === "" ? "" : ` at ${path}`}: ${msg}`);
}

/**
 * Walk parsed JS from `parseYamlWithOtaviaTags` and enforce tag placement.
 * - `!Param` is forbidden everywhere in otavia.yaml.
 * - `!Env` / `!Secret` only under top-level `variables`.
 * - `!Var` under top-level `variables` or under `cells[mount].params` values only.
 */
export function validateOtaviaTagZones(data: Record<string, unknown>): void {
  visitRoot(data);
}

function visitRoot(o: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(o)) {
    if (key === "variables") {
      visit(value, "topVariables", "variables");
    } else if (key === "cells") {
      visitCells(value, "cells");
    } else {
      visit(value, "none", key);
    }
  }
}

function visitCells(cellsNode: unknown, path: string): void {
  if (cellsNode == null) {
    throw tagError(path, "cells is required");
  }
  if (Array.isArray(cellsNode)) {
    for (let i = 0; i < cellsNode.length; i++) {
      visitCellItem(cellsNode[i], `${path}[${i}]`);
    }
    return;
  }
  if (typeof cellsNode !== "object") {
    throw tagError(path, "cells must be an object or array");
  }
  for (const [mount, def] of Object.entries(cellsNode as Record<string, unknown>)) {
    visitCellMount(def, `${path}.${mount}`);
  }
}

function visitCellItem(item: unknown, path: string): void {
  if (typeof item === "string") {
    visit(item, "none", path);
    return;
  }
  if (item == null || typeof item !== "object" || Array.isArray(item)) {
    throw tagError(path, "cells[] entry must be a string or object { package, mount?, params? }");
  }
  const record = item as Record<string, unknown>;
  for (const [k, v] of Object.entries(record)) {
    if (k === "package") {
      visit(v, "none", `${path}.package`);
    } else if (k === "params") {
      visit(v, "cellsParams", `${path}.params`);
    } else if (k === "mount") {
      visit(v, "none", `${path}.mount`);
    } else {
      visit(v, "none", `${path}.${k}`);
    }
  }
}

function visitCellMount(def: unknown, path: string): void {
  if (typeof def === "string") {
    visit(def, "none", path);
    return;
  }
  if (def == null || typeof def !== "object" || Array.isArray(def)) {
    throw tagError(path, "cell entry must be a package string or object { package, params? }");
  }
  const record = def as Record<string, unknown>;
  for (const [k, v] of Object.entries(record)) {
    if (k === "package") {
      visit(v, "none", `${path}.package`);
    } else if (k === "params") {
      visit(v, "cellsParams", `${path}.params`);
    } else {
      visit(v, "none", `${path}.${k}`);
    }
  }
}

function visit(node: unknown, zone: TagZone, path: string): void {
  if (node === null || node === undefined) return;
  if (typeof node !== "object") return;

  if (isParamRef(node)) {
    throw tagError(path, "!Param is not allowed in otavia.yaml");
  }
  if (isEnvRef(node) || isSecretRef(node)) {
    if (zone !== "topVariables") {
      throw tagError(
        path,
        "!Env and !Secret are only allowed under top-level `variables`"
      );
    }
    return;
  }
  if (isVarRef(node)) {
    if (zone !== "topVariables" && zone !== "cellsParams") {
      throw tagError(
        path,
        "!Var is only allowed under top-level `variables` or under `cells[mount].params`"
      );
    }
    return;
  }

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      visit(node[i], zone, `${path}[${i}]`);
    }
    return;
  }

  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    visit(v, zone, path === "" ? k : `${path}.${k}`);
  }
}
