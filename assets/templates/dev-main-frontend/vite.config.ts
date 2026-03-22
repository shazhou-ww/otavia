import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { mergeConfig } from "vite";
import { createMainFrontendViteConfig } from "otavia/dev/main-frontend-runtime/vite-config";

const backendPort = process.env.GATEWAY_BACKEND_PORT;
const vitePort = Number.parseInt(process.env.VITE_PORT ?? "", 10);
const frontendDir = process.env.OTAVIA_MAIN_FRONTEND_DIR;
const packageRoot = process.env.OTAVIA_MAIN_ROOT ?? process.cwd();
const workspaceRoot = process.env.OTAVIA_WORKSPACE_ROOT ?? process.cwd();

if (!frontendDir) {
  throw new Error("Missing OTAVIA_MAIN_FRONTEND_DIR");
}
if (!backendPort) {
  throw new Error("Missing GATEWAY_BACKEND_PORT");
}
if (!Number.isFinite(vitePort)) {
  throw new Error("Missing VITE_PORT");
}

const generatedConfigPath = pathToFileURL(join(frontendDir, "src", "generated", "main-dev-config.json"));

const base = createMainFrontendViteConfig({
  generatedConfigPath,
  packageRoot,
  workspaceRoot,
  backendPort,
  vitePort,
});

const rawAliases = process.env.OTAVIA_VITE_RESOLVE_ALIASES ?? "";
let resolveAlias: Record<string, string> = {};
if (rawAliases) {
  try {
    const parsed = JSON.parse(rawAliases) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      resolveAlias = Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).filter(
          ([, v]) => typeof v === "string"
        )
      ) as Record<string, string>;
    }
  } catch {
    resolveAlias = {};
  }
}

export default mergeConfig(base, {
  root: frontendDir,
  resolve: {
    alias: resolveAlias,
  },
});
