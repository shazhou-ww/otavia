import { cwd } from "node:process";
import { buildStackModel } from "@otavia/stack";
import { runDevGateway } from "../dev/gateway.js";
import { startViteDev } from "../dev/vite-dev.js";
import { loadEnvForCommand } from "../env/load-env-for-command.js";
import { mergeProcessAndFileEnv } from "../env/merge-process-env.js";
import { createHostAdapterForProvider } from "../host/create-host-adapter.js";
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
 * Local dev: validate stack, check cloud login, run gateway (+ Vite when cells define frontend).
 */
export async function runDev(cwdInput: string = cwd()): Promise<void> {
  const workspaceRoot = findWorkspaceRoot(cwdInput);
  const stackRoot = findStackRoot(cwdInput);
  if (workspaceRoot == null || stackRoot == null) {
    console.error("Run `otavia dev` from inside an Otavia workspace.");
    process.exit(1);
  }

  const fileEnv = loadEnvForCommand(workspaceRoot, "dev");
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

  const host = createHostAdapterForProvider(model.provider);
  if (process.env.OTAVIA_DEV_SKIP_CREDENTIAL_CHECK !== "1") {
    try {
      await host.checkCredentials();
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      if (model.providerKind === "aws") {
        console.error("Configure AWS credentials (e.g. aws configure) or use a profile with valid keys.");
      } else {
        console.error("Run `az login` and ensure a subscription is selected.");
      }
      console.error("(Local-only: OTAVIA_DEV_SKIP_CREDENTIAL_CHECK=1 skips this check.)");
      process.exit(1);
    }
  } else {
    console.warn(
      "[otavia] OTAVIA_DEV_SKIP_CREDENTIAL_CHECK=1: skipping cloud credential check (not for production deploy)."
    );
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
