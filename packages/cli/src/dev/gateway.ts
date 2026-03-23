import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Hono } from "hono";
import type { StackCellModel, StackModel } from "@otavia/stack";
import { buildForwardUrlForCellMount } from "./forward-url.js";
import { resolveRootRedirectMount } from "./mount-selection.js";

type HonoApp = { fetch: (req: Request) => Response | Promise<Response> };
type CreateAppFactory = (env: Record<string, string>) => HonoApp | Promise<HonoApp>;

async function loadCellGatewayApp(cell: StackCellModel): Promise<CreateAppFactory | null> {
  try {
    const mod = await import(`${cell.packageName}/backend`);
    if (typeof mod?.createAppForBackend === "function") {
      return mod.createAppForBackend as CreateAppFactory;
    }
    if (typeof mod?.createAppForGateway === "function") {
      return mod.createAppForGateway as CreateAppFactory;
    }
  } catch {
    /* try file paths */
  }
  const candidates = [
    resolve(cell.packageRootAbs, "backend", "app.ts"),
    resolve(cell.packageRootAbs, "backend", "gateway-app.ts"),
  ];
  for (const backendEntryPath of candidates) {
    if (!existsSync(backendEntryPath)) continue;
    try {
      const mod = await import(pathToFileURL(backendEntryPath).href);
      if (typeof mod?.createAppForBackend === "function") {
        return mod.createAppForBackend as CreateAppFactory;
      }
      if (typeof mod?.createAppForGateway === "function") {
        return mod.createAppForGateway as CreateAppFactory;
      }
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
    const prefix = `/${mount}`;
    app.all(`${prefix}/`, async (c) => {
      const newUrl = buildForwardUrlForCellMount(c.req.url, prefix);
      const newReq = new Request(newUrl.href, {
        method: c.req.method,
        headers: c.req.raw.headers,
        body: c.req.raw.body,
      });
      return cellApp.fetch(newReq);
    });
    app.all(`${prefix}/*`, async (c) => {
      const newUrl = buildForwardUrlForCellMount(c.req.url, prefix);
      const newReq = new Request(newUrl.href, {
        method: c.req.method,
        headers: c.req.raw.headers,
        body: c.req.raw.body,
      });
      return cellApp.fetch(newReq);
    });
    mounted++;
    console.log(`[gateway] Mounted ${mount} at /${mount}`);
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
  return { stop: () => server.stop(), port };
}
