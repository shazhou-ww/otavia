import { OtaviaCredentialUserError } from "@otavia/host-contract";
import { cwd } from "node:process";
import { buildStackModel } from "@otavia/stack";
import { runDevGateway } from "../dev/gateway.js";
import { startViteDev } from "../dev/vite-dev.js";
import { loadEnvForCommand } from "../env/load-env-for-command.js";
import { mergeProcessAndFileEnv } from "../env/merge-process-env.js";
import { findStackRoot } from "../resolve/find-stack-root.js";
import { findWorkspaceRoot } from "../resolve/find-workspace-root.js";

function parsePort(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 && n <= 65535 ? n : fallback;
}

function sleepForever(): Promise<never> {
  return new Promise(() => {});
}

/**
 * Local dev: validate stack, run gateway (+ Vite when cells define frontend).
 * Cloud credentials are not required (purely local). Set `OTAVIA_DEV_CHECK_CREDENTIALS=1` to run the
 * same credential check as deploy (optional sanity check before touching the cloud).
 */
export async function runDev(cwdInput: string = cwd()): Promise<void> {
  const workspaceRoot = findWorkspaceRoot(cwdInput);
  const stackRoot = findStackRoot(cwdInput);
  if (workspaceRoot == null || stackRoot == null) {
    console.error("Run `otavia dev` from inside an Otavia workspace.");
    process.exit(1);
  }

  const fileEnv = loadEnvForCommand(stackRoot, "dev");
  const mergedEnv = mergeProcessAndFileEnv(fileEnv);
  let model;
  try {
    model = buildStackModel({ stackRoot, workspaceRoot, env: mergedEnv });
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }

  for (const w of model.warnings) {
    console.warn(`[otavia] ${w}`);
  }

  if (process.env.OTAVIA_DEV_CHECK_CREDENTIALS === "1") {
    const { createHostAdapterForCloud } = await import("../host/create-host-adapter.js");
    const host = createHostAdapterForCloud(model.cloud);
    try {
      await host.checkCredentials();
    } catch (e) {
      if (e instanceof OtaviaCredentialUserError) {
        console.error(e.message.trimEnd());
        process.exit(1);
      }
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    }
  }

  let backendPort = parsePort("OTAVIA_BACKEND_PORT", 8787);
  const vitePort = parsePort("OTAVIA_VITE_PORT", 5173);
  const gatewayOnly = process.env.OTAVIA_DEV_GATEWAY_ONLY === "1";
  if (gatewayOnly) {
    const raw = process.env.PORT?.trim();
    if (raw) {
      const n = Number.parseInt(raw, 10);
      if (Number.isFinite(n) && n > 0 && n <= 65535) backendPort = n;
    }
  }

  const publicBaseUrl = gatewayOnly ? undefined : `http://localhost:${vitePort}`;
  const gateway = await runDevGateway(model, mergedEnv, backendPort, { publicBaseUrl });

  if (gatewayOnly) {
    process.on("SIGINT", () => {
      gateway.stop();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      gateway.stop();
      process.exit(0);
    });
    await sleepForever();
    return;
  }

  const vite = await startViteDev(model, backendPort, vitePort, publicBaseUrl);
  const cleanup = () => {
    gateway.stop();
    vite.stop();
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  await sleepForever();
}
