import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

const CONFIG_FILENAME = "otavia.yaml";

/** Set `OTAVIA_DEBUG_RESOLVE=1` (or `true` / `yes`) to print workspace and cell path resolution. */
export function isOtaviaResolveDebugEnabled(): boolean {
  const v = process.env.OTAVIA_DEBUG_RESOLVE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function logOtaviaResolve(label: string, data?: Record<string, unknown>): void {
  if (!isOtaviaResolveDebugEnabled()) return;
  const extra = data != null && Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : "";
  console.error(`[otavia:resolve] ${label}${extra}`);
}

export type OtaviaWorkspacePaths = {
  /** Bun/npm workspace root: root `package.json` declares `workspaces`; `cells/` lives here */
  monorepoRoot: string;
  /** Directory that contains `otavia.yaml` for this stack */
  configDir: string;
};

function packageJsonDeclaresWorkspaces(pkg: unknown): boolean {
  if (pkg == null || typeof pkg !== "object") return false;
  const w = (pkg as Record<string, unknown>).workspaces;
  if (w == null) return false;
  if (Array.isArray(w)) return w.length > 0;
  if (typeof w === "object" && w !== null) {
    const packages = (w as { packages?: unknown }).packages;
    return Array.isArray(packages) && packages.length > 0;
  }
  return false;
}

/**
 * Walk upward from `startDir` to filesystem root; return the nearest directory whose `package.json`
 * declares npm/Bun-style `workspaces`, or null.
 */
export function findWorkspaceRootWithWorkspaces(startDir: string): string | null {
  let dir = resolve(startDir);
  for (;;) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as unknown;
        if (packageJsonDeclaresWorkspaces(pkg)) {
          return dir;
        }
      } catch {
        // ignore invalid package.json
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function isPathUnderOrEqual(workspaceRoot: string, dir: string): boolean {
  const rel = relative(resolve(workspaceRoot), resolve(dir));
  return rel === "" || !rel.startsWith("..");
}

/**
 * Repo root for resolving `cells/` when there is **no** workspace `package.json` (legacy layout).
 * Strips trailing `.../apps/main` segments so cells stay at the real repo root.
 */
export function monorepoRootForCells(configDir: string): string {
  let c = resolve(configDir);
  for (;;) {
    const base = basename(c);
    const parent = dirname(c);
    if (base.toLowerCase() !== "main" || basename(parent).toLowerCase() !== "apps") {
      break;
    }
    c = dirname(parent);
  }
  return c;
}

function findOtaviaConfigDirOnPathFromStart(workspaceRoot: string, startDir: string): string | null {
  let dir = resolve(startDir);
  const root = resolve(workspaceRoot);
  for (;;) {
    if (!isPathUnderOrEqual(root, dir)) {
      break;
    }
    if (existsSync(join(dir, CONFIG_FILENAME))) {
      return dir;
    }
    if (dir === root) {
      break;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return null;
}

/** Under workspace root: root file, then each `apps/<name>/otavia.yaml` (sorted), first hit wins. */
function findOtaviaConfigDirUnderWorkspaceTree(workspaceRoot: string): string | null {
  const rootYaml = join(workspaceRoot, CONFIG_FILENAME);
  if (existsSync(rootYaml)) {
    return workspaceRoot;
  }
  const appsDir = join(workspaceRoot, "apps");
  if (!existsSync(appsDir)) {
    return null;
  }
  let st: ReturnType<typeof statSync>;
  try {
    st = statSync(appsDir);
  } catch {
    return null;
  }
  if (!st.isDirectory()) {
    return null;
  }
  const names = readdirSync(appsDir).sort();
  for (const name of names) {
    const appDir = join(appsDir, name);
    try {
      if (!statSync(appDir).isDirectory()) continue;
    } catch {
      continue;
    }
    const yaml = join(appDir, CONFIG_FILENAME);
    if (existsSync(yaml)) {
      return appDir;
    }
  }
  return null;
}

function resolveInsideWorkspace(workspaceRoot: string, startDir: string): OtaviaWorkspacePaths {
  const fromWalk = findOtaviaConfigDirOnPathFromStart(workspaceRoot, startDir);
  const fromTree =
    fromWalk ?? findOtaviaConfigDirUnderWorkspaceTree(workspaceRoot);
  if (fromTree == null) {
    throw new Error(
      `otavia.yaml not found under workspace root ${workspaceRoot} (walk up from cwd, then root otavia.yaml or apps/<name>/otavia.yaml)`
    );
  }
  logOtaviaResolve("workspace: configDir source", {
    method: fromWalk != null ? "walk_up_from_startDir_inside_workspace" : "workspace_tree_scan",
    workspaceRoot,
    startDir: resolve(startDir),
    configDir: fromTree,
  });
  return { monorepoRoot: workspaceRoot, configDir: fromTree };
}

/** Legacy: no workspaces package.json on the path; find otavia.yaml walking up from startDir. */
function resolveLegacy(startDir: string): OtaviaWorkspacePaths {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, CONFIG_FILENAME))) {
      const configDir = dir;
      const monorepoRoot = monorepoRootForCells(configDir);
      logOtaviaResolve("legacy: otavia.yaml found walking up", {
        startDir: resolve(startDir),
        configDir,
        monorepoRoot,
      });
      return { monorepoRoot, configDir };
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error(
    "otavia.yaml not found: use a Bun/npm workspace (root package.json with \"workspaces\") and place otavia.yaml under the workspace, or add otavia.yaml in this directory or a parent"
  );
}

/**
 * Resolve Otavia paths: monorepo root is the Bun/npm workspace root (package.json with "workspaces").
 * configDir is the directory that contains otavia.yaml: walk up from startDir within the workspace,
 * else root otavia.yaml, else first apps/<name>/otavia.yaml (sorted by name).
 * Without workspaces, falls back to walking up the filesystem for otavia.yaml (legacy).
 */
export function resolveOtaviaWorkspacePaths(startDir: string): OtaviaWorkspacePaths {
  const resolvedStart = resolve(startDir);
  logOtaviaResolve("resolveOtaviaWorkspacePaths: input", {
    startDir: resolvedStart,
    processCwd: process.cwd(),
  });

  const workspaceRoot = findWorkspaceRootWithWorkspaces(resolvedStart);
  if (workspaceRoot != null) {
    logOtaviaResolve("workspace root (package.json workspaces)", {
      workspaceRoot: resolve(workspaceRoot),
    });
    const out = resolveInsideWorkspace(workspaceRoot, resolvedStart);
    logOtaviaResolve("result", {
      monorepoRoot: out.monorepoRoot,
      configDir: out.configDir,
    });
    return out;
  }

  logOtaviaResolve("no workspace root with workspaces on path; using legacy walk", {
    hint: "ensure repo root package.json has a non-empty workspaces field",
  });
  const out = resolveLegacy(resolvedStart);
  logOtaviaResolve("result", {
    monorepoRoot: out.monorepoRoot,
    configDir: out.configDir,
  });
  return out;
}
