import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { loadOtaviaYamlAt } from "../../config/load-otavia-yaml";
import { loadCellConfig } from "../../config/load-cell-yaml";
import type { CellConfig } from "../../config/cell-yaml-schema";
import { resolveCellDir } from "../../config/resolve-cell-dir";
import { resolveRootRedirectMount } from "./mount-selection";
import { loadRenderedTemplate, loadTemplate } from "../../templates/load";
import { bunExecutable } from "../../utils/bun-executable";

export interface ViteDevHandle {
  stop: () => void;
}

export type RouteMatch = "prefix" | "exact";

export type RouteRule = {
  path: string;
  match: RouteMatch;
};

export type ProxyRule = {
  mount: string;
  path: string;
  match: RouteMatch;
  target: string;
};

export type MainDevGeneratedConfig = {
  firstMount: string;
  mounts: string[];
  routeRules: RouteRule[];
  proxyRules: ProxyRule[];
  frontendModuleProxyRules: Array<{
    path: string;
    sourcePath: string;
  }>;
  frontendRouteRules: Array<{
    mount: string;
    path: string;
    match: RouteMatch;
    entryName: string;
    entryType: "html" | "module";
  }>;
};

const GLOBAL_WELL_KNOWN_RULE: RouteRule = { path: "/.well-known", match: "prefix" };
const GLOBAL_PROXY_MOUNT = "__global__";

/** When public base is exactly loopback + vite port, Vite's default banner is already correct. */
export function publicOriginDiffersFromLocalVite(publicBaseUrl: string, vitePort: number): boolean {
  try {
    const u = new URL(publicBaseUrl);
    const host = u.hostname.toLowerCase();
    const loopback = host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
    const port = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
    if (loopback && port === vitePort) return false;
    return true;
  } catch {
    return false;
  }
}

function writeMainFrontendShell(frontendRoot: string): void {
  const srcDir = resolve(frontendRoot, "src");
  const generatedDir = resolve(srcDir, "generated");
  mkdirSync(generatedDir, { recursive: true });
  writeFileSync(resolve(frontendRoot, "index.html"), loadTemplate("dev-main-frontend/index.html"), "utf-8");
  writeFileSync(resolve(frontendRoot, "vite.config.ts"), loadTemplate("dev-main-frontend/vite.config.ts"), "utf-8");
  writeFileSync(resolve(srcDir, "main.ts"), loadTemplate("dev-main-frontend/main.ts"), "utf-8");
}

function normalizeRoutePath(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error(`Invalid backend route "${path}": route must start with "/"`);
  }
  const trimmed = path.replace(/\/+$/, "");
  return trimmed || "/";
}

export function deriveRouteRulesFromCellConfig(config: CellConfig): RouteRule[] {
  const seen = new Set<string>();
  const rules: RouteRule[] = [];
  const entries = config.backend?.entries ? Object.values(config.backend.entries) : [];
  for (const entry of entries) {
    for (const route of entry.routes ?? []) {
      const isPrefix = route.endsWith("/*");
      const rawPath = isPrefix ? route.slice(0, -2) : route;
      const path = normalizeRoutePath(rawPath);
      const match: RouteMatch = isPrefix ? "prefix" : "exact";
      const key = `${path}|${match}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rules.push({ path, match });
    }
  }
  return rules;
}

export function buildMainDevGeneratedConfig(
  cells: Array<{
    mount: string;
    routeRules: RouteRule[];
    moduleProxySpecs: FrontendModuleProxySpec[];
    frontendRouteRules: Array<{
      mount: string;
      path: string;
      match: RouteMatch;
      entryName: string;
      entryType: "html" | "module";
    }>;
  }>,
  backendPort: number,
  sourcePathBaseDir?: string
): MainDevGeneratedConfig {
  const mounts = cells.map((c) => c.mount);
  const firstMount = mounts[0] ?? "";
  const routeRulesMap = new Map<string, RouteRule>();
  const proxyRules: ProxyRule[] = [];
  const frontendModuleProxyRules: MainDevGeneratedConfig["frontendModuleProxyRules"] = [];
  const frontendRouteRules: MainDevGeneratedConfig["frontendRouteRules"] = [];
  const target = `http://localhost:${backendPort}`;

  for (const cell of cells) {
    frontendModuleProxyRules.push(
      ...cell.moduleProxySpecs.map((spec) => ({
        path: spec.routePath,
        sourcePath: sourcePathBaseDir
          ? relative(sourcePathBaseDir, spec.sourcePath).replace(/\\/g, "/")
          : spec.sourcePath,
      }))
    );
    frontendRouteRules.push(...cell.frontendRouteRules);
    for (const rule of cell.routeRules) {
      const rrKey = `${rule.path}|${rule.match}`;
      if (!routeRulesMap.has(rrKey)) routeRulesMap.set(rrKey, rule);
      const mountedPath = rule.path === "/" ? `/${cell.mount}` : `/${cell.mount}${rule.path}`;
      proxyRules.push({
        mount: cell.mount,
        path: mountedPath,
        match: rule.match,
        target,
      });
    }
  }

  const globalRuleKey = `${GLOBAL_WELL_KNOWN_RULE.path}|${GLOBAL_WELL_KNOWN_RULE.match}`;
  if (!routeRulesMap.has(globalRuleKey)) {
    routeRulesMap.set(globalRuleKey, GLOBAL_WELL_KNOWN_RULE);
  }
  proxyRules.push({
    mount: GLOBAL_PROXY_MOUNT,
    path: GLOBAL_WELL_KNOWN_RULE.path,
    match: GLOBAL_WELL_KNOWN_RULE.match,
    target,
  });

  proxyRules.sort((a, b) => {
    if (a.path === b.path) {
      if (a.match === b.match) return a.mount.localeCompare(b.mount);
      return a.match === "exact" ? -1 : 1;
    }
    return b.path.length - a.path.length;
  });

  return {
    firstMount,
    mounts,
    routeRules: Array.from(routeRulesMap.values()),
    proxyRules,
    frontendModuleProxyRules,
    frontendRouteRules,
  };
}

function normalizeFrontendRoutePath(path: string): string {
  if (path === "") return "/";
  if (!path.startsWith("/")) {
    throw new Error(`Invalid frontend route "${path}": route must start with "/"`);
  }
  const trimmed = path.replace(/\/+$/, "");
  return trimmed || "/";
}

function toMountedPath(mount: string, routePath: string): string {
  const normalizedRoute = normalizeFrontendRoutePath(routePath);
  return normalizedRoute === "/" ? `/${mount}` : `/${mount}${normalizedRoute}`;
}

function isHtmlEntry(entry: string): boolean {
  return entry.toLowerCase().endsWith(".html");
}

export function deriveFrontendRouteRulesFromCellConfig(
  mount: string,
  config: CellConfig
): MainDevGeneratedConfig["frontendRouteRules"] {
  const entries = config.frontend?.entries ? Object.entries(config.frontend.entries) : [];
  const rules: MainDevGeneratedConfig["frontendRouteRules"] = [];
  for (const [entryName, entry] of entries) {
    const entryType: "html" | "module" = isHtmlEntry(entry.entry) ? "html" : "module";
    for (const route of entry.routes ?? []) {
      const isPrefix = route.endsWith("/*");
      const rawPath = isPrefix ? route.slice(0, -2) : route;
      const path = toMountedPath(mount, rawPath);
      rules.push({
        mount,
        path,
        match: isPrefix ? "prefix" : "exact",
        entryName,
        entryType,
      });
    }
  }
  return rules;
}

type FrontendModuleProxySpec = {
  mount: string;
  routePath: string;
  sourcePath: string;
};

export function deriveFrontendModuleProxySpecs(
  mount: string,
  cellDir: string,
  config: CellConfig
): FrontendModuleProxySpec[] {
  if (!config.frontend) return [];
  const specs: FrontendModuleProxySpec[] = [];
  for (const entry of Object.values(config.frontend.entries)) {
    if (isHtmlEntry(entry.entry)) continue;
    const sourcePath = resolve(cellDir, config.frontend.dir, entry.entry).replace(/\\/g, "/");
    for (const route of entry.routes ?? []) {
      if (route.endsWith("/*")) {
        throw new Error(
          `Invalid module frontend route "${route}" for mount "${mount}": wildcard routes are only supported for HTML entries`
        );
      }
      specs.push({
        mount,
        routePath: toMountedPath(mount, route),
        sourcePath,
      });
    }
  }
  return specs;
}

function tryResolvePackageDir(pkgJsonPath: string, packageName: string): string | null {
  try {
    const req = createRequire(pkgJsonPath);
    const resolved = req.resolve(`${packageName}/package.json`);
    return dirname(resolved).replace(/\\/g, "/");
  } catch {
    return null;
  }
}

function packageJsonLookupRoots(
  monorepoRoot: string,
  cellsWithFrontend: { packageName: string }[]
): string[] {
  const roots = [resolve(monorepoRoot, "package.json")];
  for (const c of cellsWithFrontend) {
    roots.push(resolve(resolveCellDir(monorepoRoot, c.packageName), "package.json"));
  }
  return roots;
}

function resolveNamedPackageDirFromWorkspace(
  monorepoRoot: string,
  cellsWithFrontend: { packageName: string }[],
  packageName: string
): string | null {
  for (const pkgJson of packageJsonLookupRoots(monorepoRoot, cellsWithFrontend)) {
    if (!existsSync(pkgJson)) continue;
    const dir = tryResolvePackageDir(pkgJson, packageName);
    if (dir) return dir;
  }
  return null;
}

function resolveCellFrontendExportPath(cellDir: string): string | null {
  const pkgPath = resolve(cellDir, "package.json");
  if (!existsSync(pkgPath)) return null;
  let pkg: { exports?: Record<string, unknown> };
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { exports?: Record<string, unknown> };
  } catch {
    return null;
  }
  const ex = pkg.exports?.["./frontend"];
  let rel: string | null = null;
  if (typeof ex === "string") rel = ex;
  else if (ex && typeof ex === "object") {
    const o = ex as { import?: string; default?: string };
    rel = typeof o.import === "string" ? o.import : typeof o.default === "string" ? o.default : null;
  }
  if (!rel) return null;
  return resolve(cellDir, rel).replace(/\\/g, "/");
}

function buildViteResolveAliases(
  monorepoRoot: string,
  cellsWithFrontend: { packageName: string }[]
): Record<string, string> {
  const aliases: Record<string, string> = {};
  for (const c of cellsWithFrontend) {
    const cellDir = resolveCellDir(monorepoRoot, c.packageName);
    const abs = resolveCellFrontendExportPath(cellDir);
    if (abs) {
      aliases[`${c.packageName}/frontend`] = abs;
    }
  }
  const reactDir = resolveNamedPackageDirFromWorkspace(monorepoRoot, cellsWithFrontend, "react");
  const reactDomDir = resolveNamedPackageDirFromWorkspace(monorepoRoot, cellsWithFrontend, "react-dom");
  if (reactDir) aliases.react = reactDir;
  if (reactDomDir) aliases["react-dom"] = reactDomDir;
  return aliases;
}

/**
 * Start main frontend Vite dev server (single root MPA shell):
 * - root is apps/main/.otavia/dev/main-frontend
 * - dynamically loads each cell frontend via package exports ("@pkg/frontend")
 * - proxies API/OAuth requests to backend gateway with mount-aware rewrite
 * If no cell has frontend, returns a no-op stop.
 */
export async function startViteDev(
  monorepoRoot: string,
  configDir: string,
  backendPort: number,
  vitePort: number,
  publicBaseUrl?: string
): Promise<ViteDevHandle> {
  const root = resolve(configDir);
  const otavia = loadOtaviaYamlAt(configDir);
  const cellsWithFrontend: {
    mount: string;
    packageName: string;
    routeRules: RouteRule[];
    frontendRouteRules: MainDevGeneratedConfig["frontendRouteRules"];
    moduleProxySpecs: FrontendModuleProxySpec[];
  }[] = [];

  for (const entry of otavia.cellsList) {
    const cellDir = resolveCellDir(monorepoRoot, entry.package);
    const cellYamlPath = resolve(cellDir, "cell.yaml");
    if (!existsSync(cellYamlPath)) continue;
    const config = loadCellConfig(cellDir);
    if (!config.frontend?.dir) continue;
    const routeRules = deriveRouteRulesFromCellConfig(config);
    const frontendRouteRules = deriveFrontendRouteRulesFromCellConfig(entry.mount, config);
    const moduleProxySpecs = deriveFrontendModuleProxySpecs(entry.mount, cellDir, config);
    cellsWithFrontend.push({
      mount: entry.mount,
      packageName: entry.package,
      routeRules,
      frontendRouteRules,
      moduleProxySpecs,
    });
  }

  if (cellsWithFrontend.length === 0) {
    console.log("[vite] No cells with frontend, skipping Vite dev server");
    return { stop: () => {} };
  }

  const frontendRoot = resolve(root, ".otavia", "dev", "main-frontend");
  writeMainFrontendShell(frontendRoot);
  const srcDir = resolve(frontendRoot, "src");
  const generatedDir = resolve(srcDir, "generated");
  mkdirSync(generatedDir, { recursive: true });

  const generatedLoadersPath = resolve(generatedDir, "mount-loaders.ts");
  const generatedDevConfigPath = resolve(generatedDir, "main-dev-config.json");
  const firstMount = cellsWithFrontend[0].mount;
  const rootRedirectMount = resolveRootRedirectMount(
    cellsWithFrontend.map((c) => c.mount),
    otavia.defaultCell
  );
  const mountLoaderEntries = cellsWithFrontend
    .map((c) => `  ${JSON.stringify(c.mount)}: () => import(${JSON.stringify(`${c.packageName}/frontend`)}),`)
    .join("\n");
  const loadersSource = loadRenderedTemplate("dev-main-frontend/mount-loaders.ts.tmpl", {
    firstMountJson: JSON.stringify(firstMount),
    rootRedirectMountJson: JSON.stringify(rootRedirectMount),
    mountsJson: JSON.stringify(cellsWithFrontend.map((c) => c.mount)),
    mountLoaderEntries,
  });
  writeFileSync(generatedLoadersPath, loadersSource, "utf-8");
  const generatedDevConfig = buildMainDevGeneratedConfig(cellsWithFrontend, backendPort, monorepoRoot);
  writeFileSync(generatedDevConfigPath, JSON.stringify(generatedDevConfig, null, 2), "utf-8");

  const viteResolveAliases = buildViteResolveAliases(monorepoRoot, cellsWithFrontend);

  const env: Record<string, string | undefined> = {
    ...process.env,
    OTAVIA_MOUNTS: JSON.stringify(cellsWithFrontend.map((c) => c.mount)),
    OTAVIA_FIRST_MOUNT: firstMount,
    VITE_PORT: String(vitePort),
    GATEWAY_BACKEND_PORT: String(backendPort),
    OTAVIA_MAIN_ROOT: root,
    /** Bun/npm workspace root: Vite resolves @scope/cell and allows fs under this path. */
    OTAVIA_WORKSPACE_ROOT: monorepoRoot,
    /** Absolute path so vite.config does not rely on import.meta.url (Vite may load config from a temp file). */
    OTAVIA_MAIN_FRONTEND_DIR: frontendRoot,
    /** JSON map: workspace subpath + react/react-dom -> absolute dirs for Vite optimizeDeps + imports. */
    OTAVIA_VITE_RESOLVE_ALIASES: JSON.stringify(viteResolveAliases),
  };
  /** Public dev base (tunnel, etc.): make Vite's startup banner show this origin instead of localhost/LAN. */
  const pub = publicBaseUrl?.trim();
  if (pub && publicOriginDiffersFromLocalVite(pub, vitePort)) {
    env.OTAVIA_VITE_PRINT_BASE_URL = pub.replace(/\/$/, "");
  }

  const configPath = resolve(frontendRoot, "vite.config.ts");
  // cwd = monorepo root so Node resolves the \`otavia\` package from hoisted node_modules. Project root is set via mergeConfig({ root }).
  const child = Bun.spawn([bunExecutable(), "x", "vite", "--config", configPath], {
    cwd: monorepoRoot,
    env,
    stdio: ["ignore", "inherit", "inherit"],
  });

  const stop = () => {
    child.kill();
  };

  child.exited.then((code) => {
    if (code !== 0 && code !== null) {
      console.error(`[vite] Process exited with code ${code}`);
    }
  });

  const base = publicBaseUrl?.replace(/\/$/, "") ?? `http://localhost:${vitePort}`;
  console.log(
    `[vite] Main frontend dev server starting at ${base} (mounts: ${cellsWithFrontend
      .map((c) => c.mount)
      .join(", ")})`
  );
  return { stop };
}
