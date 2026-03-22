/**
 * Emit JS for Vite-loaded entrypoints (avoid Node ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING on .ts under node_modules).
 */
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = join(root, "dist/dev/main-frontend-runtime");
mkdirSync(outdir, { recursive: true });

const nodeExternal = /^node:/;

const viteResult = await Bun.build({
  entrypoints: [join(root, "src/commands/dev/main-frontend-runtime/vite-config.ts")],
  outdir,
  naming: "[name].js",
  format: "esm",
  target: "node",
  external: ["vite", "@vitejs/plugin-react", nodeExternal],
});

if (!viteResult.success) {
  console.error(viteResult.logs);
  process.exit(1);
}

const mainResult = await Bun.build({
  entrypoints: [join(root, "src/commands/dev/main-frontend-runtime/main-entry.ts")],
  outdir,
  naming: "[name].js",
  format: "esm",
  target: "browser",
});

if (!mainResult.success) {
  console.error(mainResult.logs);
  process.exit(1);
}

console.log("build:runtime OK →", outdir);
