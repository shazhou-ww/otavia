import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseCellYaml } from "./cell/parse-cell-yaml.js";
import { resolveCellBodyFields } from "./cell/resolve-cell-body.js";
import { resolveCellVariables } from "./cell/resolve-cell-variables.js";
import { type DeployParams, parseOtaviaYaml, providerKind } from "./otavia/parse-otavia-yaml.js";
import { resolveCellMountParams } from "./otavia/resolve-cell-mount-params.js";
import { resolveCellPackageDir } from "./resolve/resolve-cell-package-dir.js";
import type { StackCellModel, StackModel } from "./types.js";
import { resolveTopVariables } from "./variables/resolve-top-variables.js";

function detectWorkspaceRoot(stackRootAbs: string, explicit?: string): string {
  if (explicit != null && explicit !== "") {
    return resolve(explicit);
  }
  let dir = stackRootAbs;
  for (;;) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const raw = readFileSync(pkgPath, "utf8");
        const pkg = JSON.parse(raw) as { workspaces?: unknown };
        if (pkg.workspaces != null) {
          return dir;
        }
      } catch {
        /* ignore invalid package.json */
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return dirname(stackRootAbs);
    }
    dir = parent;
  }
}

function toPosixPathRelativeToStack(stackRootAbs: string, absolutePath: string): string {
  const rel = relative(stackRootAbs, absolutePath);
  if (!rel || rel === ".") return ".";
  return rel.split(sep).join("/");
}

function normalizeBackendEntries(
  be: Record<string, unknown>,
  cellRootAbs: string,
  stackRootAbs: string
): void {
  const entries = be.entries;
  if (entries == null || typeof entries !== "object" || Array.isArray(entries)) return;
  for (const ent of Object.values(entries as Record<string, unknown>)) {
    if (ent && typeof ent === "object" && !Array.isArray(ent)) {
      const e = ent as Record<string, unknown>;
      if (typeof e.entry === "string") {
        e.entry = toPosixPathRelativeToStack(stackRootAbs, resolve(cellRootAbs, e.entry));
      }
    }
  }
}

function normalizeFrontendEntries(
  fe: Record<string, unknown>,
  cellRootAbs: string,
  stackRootAbs: string
): void {
  const entries = fe.entries;
  if (entries == null || typeof entries !== "object" || Array.isArray(entries)) return;
  for (const ent of Object.values(entries as Record<string, unknown>)) {
    if (ent && typeof ent === "object" && !Array.isArray(ent)) {
      const e = ent as Record<string, unknown>;
      if (typeof e.entry === "string") {
        e.entry = toPosixPathRelativeToStack(stackRootAbs, resolve(cellRootAbs, e.entry));
      }
    }
  }
}

function normalizeCellConfigPaths(
  backend: unknown,
  frontend: unknown,
  cellRootAbs: string,
  stackRootAbs: string
): { backend?: unknown; frontend?: unknown } {
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  const nb = backend != null ? clone(backend) : undefined;
  const nf = frontend != null ? clone(frontend) : undefined;
  if (nb && typeof nb === "object" && !Array.isArray(nb)) {
    normalizeBackendEntries(nb as Record<string, unknown>, cellRootAbs, stackRootAbs);
  }
  if (nf && typeof nf === "object" && !Array.isArray(nf)) {
    normalizeFrontendEntries(nf as Record<string, unknown>, cellRootAbs, stackRootAbs);
  }
  return { backend: nb, frontend: nf };
}

function mergeDeployParams(
  baseDeploy: DeployParams | undefined,
  cellOverride: DeployParams | undefined
): DeployParams | undefined {
  if (baseDeploy == null && cellOverride == null) return undefined;
  return { ...baseDeploy, ...cellOverride };
}

function assertDeclaredCellParams(
  mount: string,
  declared: string[],
  stackParams: Record<string, unknown> | undefined
): void {
  for (const p of declared) {
    if (stackParams == null || !Object.prototype.hasOwnProperty.call(stackParams, p)) {
      throw new Error(
        `otavia.yaml: cell mount "${mount}" is missing required param "${p}" declared in cell.yaml`
      );
    }
  }
}

export function buildStackModel(input: {
  stackRoot: string;
  workspaceRoot?: string;
  env: Record<string, string>;
}): StackModel {
  const stackRootAbs = resolve(input.stackRoot);
  const workspaceRootAbs = detectWorkspaceRoot(stackRootAbs, input.workspaceRoot);
  const otaviaPath = join(stackRootAbs, "otavia.yaml");
  const content = readFileSync(otaviaPath, "utf8");
  const parsed = parseOtaviaYaml(content);
  const top = resolveTopVariables(parsed.variables, input.env);
  const pk = providerKind(parsed.cloud);

  const warnings = [...parsed.warnings];
  const cells: Record<string, StackCellModel> = {};
  const cellMountOrder: string[] = [];

  for (const item of parsed.cellsList) {
    cellMountOrder.push(item.mount);
    const pkgRootAbs = resolveCellPackageDir(stackRootAbs, item.package);
    const cellYamlPath = join(pkgRootAbs, "cell.yaml");
    const cellYaml = parseCellYaml(readFileSync(cellYamlPath, "utf8"));
    for (const w of cellYaml.warnings) {
      warnings.push(`cell "${item.mount}": ${w}`);
    }

    assertDeclaredCellParams(item.mount, cellYaml.params, item.params);
    const mergedStackParams = resolveCellMountParams(item.params, top.values);
    const cellVariableValues = resolveCellVariables(
      undefined,
      mergedStackParams,
      input.env
    );
    const resolvedBody = resolveCellBodyFields(
      cellYaml.backend,
      cellYaml.frontend,
      mergedStackParams,
      cellVariableValues
    );
    const normalized = normalizeCellConfigPaths(
      resolvedBody.backend,
      resolvedBody.frontend,
      pkgRootAbs,
      stackRootAbs
    );

    const cellDeploy = mergeDeployParams(parsed.deploy, item.deploy);

    cells[item.mount] = {
      mount: item.mount,
      packageName: item.package,
      packageRootAbs: pkgRootAbs,
      name: cellYaml.name,
      mergedStackParams,
      cellVariableValues,
      backend: normalized.backend,
      frontend: normalized.frontend,
      ...(cellDeploy ? { deploy: cellDeploy } : {}),
    };
  }

  return {
    stackRootAbs,
    workspaceRootAbs,
    name: parsed.name,
    providerKind: pk,
    cloud: parsed.cloud,
    topLevelVariableValues: top.values,
    environments: top.environments,
    secrets: top.secrets,
    cellMountOrder,
    cells,
    resourceTables: parsed.resourceTables,
    ...(parsed.deploy ? { deploy: parsed.deploy } : {}),
    warnings,
  };
}
