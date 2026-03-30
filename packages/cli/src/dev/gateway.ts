import { existsSync, watch, type FSWatcher } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Hono } from "hono";
import type { StackCellModel, StackModel } from "@otavia/stack";
import { buildForwardUrlForCellMount } from "./forward-url.js";
import { resolveRootRedirectMount } from "./mount-selection.js";

type HonoApp = { fetch: (req: Request) => Response | Promise<Response> };
type CreateAppFactory = (env: Record<string, string>) => HonoApp | Promise<HonoApp>;

type CellBackendConfig = {
  dir?: string;
  entries?: Record<string, { entry?: string; routes?: string[] }>;
};

/** Mutable cell app reference so Hono handlers always dispatch to the latest loaded version. */
type CellAppRef = { current: HonoApp | null };

function extractGatewayFactory(mod: Record<string, unknown>): CreateAppFactory | null {
  if (typeof mod?.createAppForBackend === "function") {
    return mod.createAppForBackend as CreateAppFactory;
  }
  if (typeof mod?.createAppForGateway === "function") {
    return mod.createAppForGateway as CreateAppFactory;
  }
  return null;
}

function buildBackendEntryCandidates(cell: StackCellModel): string[] {
  const backend = cell.backend as CellBackendConfig | undefined;
  const backendDir = backend?.dir ?? "backend";
  const entries = backend?.entries;
  if (entries && Object.keys(entries).length > 0) {
    const paths: string[] = [];
    for (const entry of Object.values(entries)) {
      if (entry.entry) {
        paths.push(resolve(cell.packageRootAbs, backendDir, entry.entry));
      }
    }
    if (paths.length > 0) return paths;
  }
  return [
    resolve(cell.packageRootAbs, backendDir, "app.ts"),
    resolve(cell.packageRootAbs, backendDir, "gateway-app.ts"),
  ];
}

async function loadCellGatewayApp(
  cell: StackCellModel,
  bustCache = false,
): Promise<CreateAppFactory | null> {
  // When busting cache we skip the package-name import (it uses Bun's module
  // registry which we cannot easily invalidate) and go straight to file paths
  // with a unique query-string to bypass the import cache.
  if (!bustCache) {
    try {
      const mod = await import(`${cell.packageName}/backend`);
      const factory = extractGatewayFactory(mod);
      if (factory) return factory;
    } catch {
      /* try file paths */
    }
  }
  const suffix = bustCache ? `?t=${Date.now()}` : "";
  for (const backendEntryPath of buildBackendEntryCandidates(cell)) {
    if (!existsSync(backendEntryPath)) continue;
    try {
      const mod = await import(`${pathToFileURL(backendEntryPath).href}${suffix}`);
      const factory = extractGatewayFactory(mod);
      if (factory) return factory;
    } catch {
      /* next */
    }
  }
  return null;
}

function buildCellEnv(
  cell: StackCellModel,
  backendPort: number,
  mergedEnv: Record<string, string>,
  publicBaseUrl?: string
): Record<string, string> {
  const env = { ...mergedEnv };
  for (const [k, v] of Object.entries(cell.mergedStackParams)) env[k] = v;
  for (const [k, v] of Object.entries(cell.cellVariableValues)) env[k] = v;
  const base = (publicBaseUrl ?? `http://localhost:${backendPort}`).replace(/\/$/, "");
  env.CELL_BASE_URL = `${base}/${cell.mount}`;
  return env;
}

export type DevGatewayServer = { stop: () => void; port: number };

// ---------------------------------------------------------------------------
// Hot-reload helpers
// ---------------------------------------------------------------------------

/** Simple debounce that collapses rapid calls into one trailing invocation. */
export function createDebounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  };
}

export const WATCHED_EXTENSIONS = /\.(ts|js|tsx|jsx|mts|mjs)$/;

/**
 * Watch a cell's backend directory for `.ts`/`.js` changes and reload the
 * cell's Hono app (via the mutable `appRef`) without restarting the server.
 */
export function setupCellWatcher(
  cell: StackCellModel,
  env: Record<string, string>,
  appRef: CellAppRef,
): FSWatcher | null {
  const backend = cell.backend as CellBackendConfig | undefined;
  const backendDir = backend?.dir ?? "backend";
  const watchDir = resolve(cell.packageRootAbs, backendDir);
  if (!existsSync(watchDir)) return null;

  const reload = createDebounce(async () => {
    console.log(`[otavia] reloading ${cell.mount}...`);
    try {
      const factory = await loadCellGatewayApp(cell, /* bustCache */ true);
      if (!factory) {
        console.warn(`[otavia] reload failed: no createAppForBackend for "${cell.mount}"`);
        return;
      }
      const newApp = await Promise.resolve(factory(env));
      appRef.current = newApp;
      console.log(`[otavia] reloaded ${cell.mount} ✔`);
    } catch (err) {
      console.error(`[otavia] reload error for "${cell.mount}":`, err);
    }
  }, 300);

  try {
    const watcher = watch(watchDir, { recursive: true }, (_event, filename) => {
      if (filename && WATCHED_EXTENSIONS.test(filename)) {
        reload();
      }
    });
    return watcher;
  } catch (err) {
    console.warn(`[otavia] could not watch ${watchDir}:`, err);
    return null;
  }
}

/**
 * Single-process dev gateway: mounts each cell's `createAppForBackend` at `/<mount>`.
 * Does not start Docker or legacy AWS-only local resources.
 */
export async function runDevGateway(
  model: StackModel,
  mergedEnv: Record<string, string>,
  backendPort: number,
  options?: { publicBaseUrl?: string }
): Promise<DevGatewayServer> {
  const mounts = model.cellMountOrder;
  const app = new Hono();
  const rootRedirect = resolveRootRedirectMount(mounts, undefined);

  if (rootRedirect) {
    app.get("/", (c) => c.redirect(`/${rootRedirect}/`, 301));
  } else {
    app.get("/", (c) => c.text("No cells in stack.", 404));
  }

  for (const m of mounts) {
    app.get(`/${m}`, (c) => c.redirect(`/${m}/`, 301));
  }

  const watchers: FSWatcher[] = [];
  let mounted = 0;
  for (const mount of mounts) {
    const cell = model.cells[mount];
    if (!cell) continue;
    const factory = await loadCellGatewayApp(cell);
    if (!factory) {
      console.warn(`[gateway] No createAppForBackend for mount "${mount}", skipping`);
      continue;
    }
    const env = buildCellEnv(cell, backendPort, mergedEnv, options?.publicBaseUrl);
    const cellApp = await Promise.resolve(factory(env));

    // Mutable reference: route handlers always call appRef.current so we can
    // swap the backing app on hot-reload without touching the Hono router.
    const appRef: CellAppRef = { current: cellApp };

    const prefix = `/${mount}`;
    app.all(`${prefix}/`, async (c) => {
      if (!appRef.current) return c.text("Cell not loaded", 503);
      const newUrl = buildForwardUrlForCellMount(c.req.url, prefix);
      const newReq = new Request(newUrl.href, {
        method: c.req.method,
        headers: c.req.raw.headers,
        body: c.req.raw.body,
      });
      return appRef.current.fetch(newReq);
    });
    app.all(`${prefix}/*`, async (c) => {
      if (!appRef.current) return c.text("Cell not loaded", 503);
      const newUrl = buildForwardUrlForCellMount(c.req.url, prefix);
      const newReq = new Request(newUrl.href, {
        method: c.req.method,
        headers: c.req.raw.headers,
        body: c.req.raw.body,
      });
      return appRef.current.fetch(newReq);
    });
    mounted++;
    console.log(`[gateway] Mounted ${mount} at /${mount}`);

    // Set up hot-reload watcher for this cell
    const watcher = setupCellWatcher(cell, env, appRef);
    if (watcher) watchers.push(watcher);
  }

  if (mounted === 0 && mounts.length > 0) {
    app.notFound((c) =>
      c.text("Otavia dev gateway: no cell exported createAppForBackend (try backend/app.ts).", 404)
    );
  }

  const server = Bun.serve({
    port: backendPort,
    hostname: "0.0.0.0",
    fetch: app.fetch,
  });

  const port = server.port ?? backendPort;
  console.log(`[gateway] Listening on http://localhost:${port}`);
  return {
    stop: () => {
      for (const w of watchers) w.close();
      server.stop();
    },
    port,
  };
}
