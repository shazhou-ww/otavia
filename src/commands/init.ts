import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { loadOtaviaYaml } from "../config/load-otavia-yaml.js";
import { getOtaviaPackageVersion } from "../package-version.js";
import {
  defaultPackageScopeFromDir,
  normalizePackageScope,
  scopedPackageName,
} from "../utils/package-scope.js";

const HELLO_MOUNT = "hello";
const APPS_MAIN = join("apps", "main");

function yamlScalar(s: string): string {
  if (/^[\w.-]+$/.test(s)) return s;
  return JSON.stringify(s);
}

/** Valid npm package name segment from directory name */
function packageBaseName(rootDir: string): string {
  const base = basename(rootDir)
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return base || "otavia-project";
}

function mergeGitignore(root: string): void {
  const lines = ["node_modules/", "dist/", ".otavia/", ".env.local"];
  const p = resolve(root, ".gitignore");
  if (!existsSync(p)) {
    writeFileSync(p, `${lines.join("\n")}\n`, "utf-8");
    return;
  }
  const existing = readFileSync(p, "utf-8");
  const missing = lines.filter((line) => !existing.split("\n").some((l) => l.trim() === line.trim()));
  if (missing.length === 0) return;
  appendFileSync(p, `${existing.endsWith("\n") ? "" : "\n"}${missing.join("\n")}\n`, "utf-8");
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

/**
 * Scaffold an Otavia monorepo: root `package.json` (workspaces), `apps/main` (entry + `otavia.yaml` only),
 * and cell packages under top-level `cells/<name>/` (not under `apps/main`).
 */
export function initCommand(
  rootDir: string,
  options: { force?: boolean; stackName?: string; domain?: string; packageScope: string }
): void {
  const root = resolve(rootDir);
  const otaviaVersion = getOtaviaPackageVersion();
  const pkgBase = packageBaseName(root);
  const rootPackageName = `otavia-${pkgBase}`.replace(/-{2,}/g, "-");
  const packageScope = normalizePackageScope(options.packageScope);
  const helloPkg = scopedPackageName(packageScope, HELLO_MOUNT);
  const mainPkg = scopedPackageName(packageScope, "main");

  mkdirSync(resolve(root, "packages"), { recursive: true });
  mkdirSync(resolve(root, APPS_MAIN), { recursive: true });
  mkdirSync(resolve(root, "cells", HELLO_MOUNT), { recursive: true });

  const packagesKeep = resolve(root, "packages", ".gitkeep");
  if (!existsSync(packagesKeep)) {
    writeFileSync(packagesKeep, "", "utf-8");
  }

  const configPath = resolve(root, APPS_MAIN, "otavia.yaml");

  if (existsSync(configPath) && !options.force) {
    throw new Error("apps/main/otavia.yaml already exists. Use --force to overwrite.");
  }

  const stackName =
    options.stackName?.trim() ||
    basename(root).replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-|-$/g, "").toLowerCase() ||
    "my-stack";
  const domainHost = options.domain?.trim() || "example.com";

  const yamlContent = `# Otavia stack — edit stackName, domain, and cells.
stackName: ${yamlScalar(stackName)}
defaultCell: ${HELLO_MOUNT}
domain:
  host: ${yamlScalar(domainHost)}
cells:
  ${HELLO_MOUNT}: ${yamlScalar(helloPkg)}
`;

  writeFileSync(configPath, yamlContent, "utf-8");

  const mainEnvExample = `# Local dev ports: backend = PORT_BASE + 1900, frontend = PORT_BASE + 100
PORT_BASE=7000
# AWS (for deploy / otavia dev credential check)
# AWS_PROFILE=default
# AWS_REGION=us-east-1
`;

  const mainEnvPath = resolve(root, APPS_MAIN, ".env");
  const mainEnvExamplePath = resolve(root, APPS_MAIN, ".env.example");
  if (!existsSync(mainEnvExamplePath) || options.force) {
    writeFileSync(mainEnvExamplePath, mainEnvExample, "utf-8");
  }
  if (!existsSync(mainEnvPath) || options.force) {
    writeFileSync(mainEnvPath, `PORT_BASE=7000\n`, "utf-8");
  }

  writeJson(resolve(root, "package.json"), {
    name: rootPackageName,
    private: true,
    type: "module",
    workspaces: ["packages/*", "cells/*", "apps/*"],
    scripts: {
      dev: "bun run --cwd apps/main dev",
      test: "bun run --cwd apps/main test",
      "test:unit": "bun run --cwd apps/main test:unit",
      "test:e2e": "bun run --cwd apps/main test:e2e",
      deploy: "bun run --cwd apps/main deploy",
      typecheck: "bun run --cwd apps/main typecheck",
      lint: "bun run --cwd apps/main lint",
      clean: "bun run --cwd apps/main clean",
      setup: "bun run --cwd apps/main setup",
      aws: "bun run --cwd apps/main aws",
    },
    devDependencies: {
      otavia: `^${otaviaVersion}`,
      typescript: "^5.8.3",
      "@types/bun": "^1.3.11",
      vite: "^7.x",
      "@vitejs/plugin-react": "^4.x",
    },
  });

  // Scripts only: resolve `otavia` from the repo root (avoid a nested apps/main/node_modules/otavia pin).
  writeJson(resolve(root, APPS_MAIN, "package.json"), {
    name: mainPkg,
    private: true,
    type: "module",
    scripts: {
      dev: "otavia dev",
      test: "otavia test",
      "test:unit": "otavia test:unit",
      "test:e2e": "otavia test:e2e",
      deploy: "otavia deploy",
      typecheck: "otavia typecheck",
      lint: "otavia lint",
      clean: "otavia clean",
      setup: "otavia setup",
      aws: "otavia aws",
      "aws:login": "otavia aws login",
      "aws:logout": "otavia aws logout",
    },
  });

  const cellDir = resolve(root, "cells", HELLO_MOUNT);
  const cellYamlPath = resolve(cellDir, "cell.yaml");
  if (!existsSync(cellYamlPath) || options.force) {
    writeFileSync(
      cellYamlPath,
      `name: ${HELLO_MOUNT}
backend:
  runtime: nodejs20.x
  entries:
    api:
      handler: backend/handler.ts
      timeout: 30
      memory: 256
      routes:
        - /api/*
frontend:
  dir: frontend
  entries:
    shell:
      entry: shell.ts
      routes:
        - /
`,
      "utf-8"
    );
  }

  mkdirSync(resolve(cellDir, "backend"), { recursive: true });
  mkdirSync(resolve(cellDir, "frontend"), { recursive: true });

  // React on the cell (devDependencies): main Vite shell uses @vitejs/plugin-react; hoisted by workspaces for resolve. Not backend runtime / Lambda zip.
  writeJson(resolve(cellDir, "package.json"), {
    name: helloPkg,
    version: "0.1.0",
    private: true,
    type: "module",
    exports: {
      "./backend": "./backend/app.ts",
      "./frontend": "./frontend/shell.ts",
    },
    dependencies: {
      hono: "^4.6.0",
    },
    devDependencies: {
      "@types/bun": "^1.3.11",
      typescript: "^5.8.3",
      vite: "^7.x",
      "react": "^18.3.1",
      "react-dom": "^18.3.1",
      "@types/react": "^18.3.12",
      "@types/react-dom": "^18.3.1",
    },
  });

  writeFileSync(
    resolve(cellDir, "backend", "app.ts"),
    `import { Hono } from "hono";

/**
 * Hono app factory for local dev (otavia dev gateway) and shared logic.
 */
export function createAppForBackend(_env: Record<string, string>) {
  const app = new Hono();
  app.get("/api/hello", (c) => c.json({ message: "hello from ${helloPkg}" }));
  return app;
}
`,
    "utf-8"
  );

  writeFileSync(
    resolve(cellDir, "backend", "handler.ts"),
    `import { handle } from "hono/aws-lambda";
import { createAppForBackend } from "./app";

const app = createAppForBackend(process.env as Record<string, string>);

export const handler = handle(app);
`,
    "utf-8"
  );

  writeFileSync(
    resolve(cellDir, "frontend", "shell.ts"),
    `/**
 * Loaded by the main dev shell (dynamic import \`${helloPkg}/frontend\`).
 * Renders into \`#root\` from apps/main/.otavia/dev/main-frontend.
 */
const root = document.getElementById("root");
if (root) {
  const h1 = document.createElement("h1");
  h1.textContent = "Hello, Otavia!";
  root.replaceChildren(h1);
}
`,
    "utf-8"
  );

  writeFileSync(
    resolve(cellDir, "frontend", "index.html"),
    `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Hello</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/shell.ts"></script>
  </body>
</html>
`,
    "utf-8"
  );

  writeFileSync(
    resolve(cellDir, "frontend", "vite.config.ts"),
    `import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  build: {
    emptyOutDir: true,
  },
});
`,
    "utf-8"
  );

  writeJson(resolve(cellDir, "tsconfig.json"), {
    compilerOptions: {
      module: "ESNext",
      target: "ES2022",
      lib: ["ES2022", "DOM"],
      moduleResolution: "bundler",
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      types: ["bun"],
    },
    include: ["backend/**/*.ts", "frontend/**/*.ts"],
  });

  mergeGitignore(root);

  loadOtaviaYaml(root);

  console.log(`Initialized Otavia monorepo in ${root}`);
  console.log(`  package scope: ${packageScope} (main = ${mainPkg}, cells under cells/)`);
  console.log(`  ${configPath}`);
  console.log(`  ${cellYamlPath}`);
  console.log(`  ${resolve(root, "package.json")}`);
}

/**
 * Resolve npm scope for `otavia init`: uses `--scope` when set, otherwise prompts if stdin is a TTY,
 * otherwise defaults from the directory name.
 */
export async function resolvePackageScopeForInit(options: {
  cwd: string;
  explicitScope?: string;
}): Promise<string> {
  if (options.explicitScope?.trim()) {
    return normalizePackageScope(options.explicitScope);
  }
  const defaultScope = defaultPackageScopeFromDir(options.cwd);
  if (!process.stdin.isTTY) {
    return defaultScope;
  }
  const readline = await import("node:readline/promises");
  const { stdin, stdout } = await import("node:process");
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const line = await rl.question(
      `npm package scope (@scope/main, @scope/<cell>) [${defaultScope}]: `
    );
    const trimmed = line.trim();
    return trimmed ? normalizePackageScope(trimmed) : defaultScope;
  } finally {
    rl.close();
  }
}
