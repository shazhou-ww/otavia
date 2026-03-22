import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { loadOtaviaYaml } from "../config/load-otavia-yaml";
import { getOtaviaPackageVersion } from "../package-version";
import { loadRenderedTemplate, loadTemplate } from "../templates/load";
import {
  defaultPackageScopeFromDir,
  normalizePackageScope,
  scopedPackageName,
} from "../utils/package-scope";

function initGitignoreLines(): string[] {
  return loadTemplate("init/gitignore-lines.txt")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
}

const HELLO_MOUNT = "hello";
const APPS_MAIN = join("apps", "main");
/** Default `PORT_BASE` in `apps/main/.env.example` (copy to `.env` via `otavia setup`). */
const DEFAULT_PORT_BASE = 7000;

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
  const lines = initGitignoreLines();
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
 * Each cell holds only its source tree and `cell.yaml` (no per-cell bundler config in the template).
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

  const packagesReadme = resolve(root, "packages", "README.md");
  if (!existsSync(packagesReadme) || options.force) {
    writeFileSync(packagesReadme, loadTemplate("init/packages-readme.md"), "utf-8");
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

  writeFileSync(
    configPath,
    loadRenderedTemplate("init/otavia.yaml.tmpl", {
      stackNameYaml: yamlScalar(stackName),
      helloMount: HELLO_MOUNT,
      domainHostYaml: yamlScalar(domainHost),
      helloPkgYaml: yamlScalar(helloPkg),
    }),
    "utf-8"
  );

  const mainEnvExamplePath = resolve(root, APPS_MAIN, ".env.example");
  if (!existsSync(mainEnvExamplePath) || options.force) {
    writeFileSync(
      mainEnvExamplePath,
      loadRenderedTemplate("init/apps-main.env.example.tmpl", {
        defaultPortBase: String(DEFAULT_PORT_BASE),
      }),
      "utf-8"
    );
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
      loadRenderedTemplate("init/cell-hello/cell.yaml.tmpl", { helloMount: HELLO_MOUNT }),
      "utf-8"
    );
  }

  mkdirSync(resolve(cellDir, "backend"), { recursive: true });
  mkdirSync(resolve(cellDir, "frontend"), { recursive: true });

  // React on the cell (devDependencies): loaded by otavia dev main shell via @vitejs/plugin-react. Not backend / Lambda zip.
  writeJson(resolve(cellDir, "package.json"), {
    name: helloPkg,
    version: "0.1.0",
    private: true,
    type: "module",
    exports: {
      "./backend": "./backend/app.ts",
      "./frontend": "./frontend/shell.tsx",
    },
    dependencies: {
      hono: "^4.6.0",
    },
    devDependencies: {
      "@types/bun": "^1.3.11",
      typescript: "^5.8.3",
      "react": "^18.3.1",
      "react-dom": "^18.3.1",
      "@types/react": "^18.3.12",
      "@types/react-dom": "^18.3.1",
    },
  });

  writeFileSync(
    resolve(cellDir, "backend", "app.ts"),
    loadRenderedTemplate("init/cell-hello/backend/app.ts.tmpl", { helloPkg }),
    "utf-8"
  );

  writeFileSync(
    resolve(cellDir, "backend", "handler.ts"),
    loadTemplate("init/cell-hello/backend/handler.ts"),
    "utf-8"
  );

  writeFileSync(
    resolve(cellDir, "frontend", "shell.tsx"),
    loadRenderedTemplate("init/cell-hello/frontend/shell.tsx.tmpl", { helloPkg }),
    "utf-8"
  );

  writeJson(resolve(cellDir, "tsconfig.json"), {
    compilerOptions: {
      module: "ESNext",
      target: "ES2022",
      lib: ["ES2022", "DOM"],
      moduleResolution: "bundler",
      jsx: "react-jsx",
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      types: ["bun"],
    },
    include: ["backend/**/*.ts", "frontend/**/*.ts", "frontend/**/*.tsx"],
  });

  mergeGitignore(root);

  loadOtaviaYaml(root);

  console.log(`Initialized Otavia monorepo in ${root}`);
  console.log(`  package scope: ${packageScope} (main = ${mainPkg}, cells under cells/)`);
  console.log(`  ${configPath}`);
  console.log(`  ${cellYamlPath}`);
  console.log(`  ${resolve(root, "package.json")}`);
  console.log(
    `  Next: bun install, then bun run setup (creates apps/main/.env from .env.example), then bun run dev.`
  );
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
