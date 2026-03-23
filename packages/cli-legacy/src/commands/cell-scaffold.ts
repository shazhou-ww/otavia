import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadRenderedTemplate, loadTemplate } from "../templates/load";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

/**
 * Cell URL mount segment: lowercase, digits, hyphens; must not start/end with hyphen.
 */
export function validateCellMount(mount: string): string {
  const m = mount.trim();
  if (!m) {
    throw new Error("Cell mount is empty");
  }
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(m)) {
    throw new Error(
      `Invalid cell mount "${mount}". Use lowercase letters, digits, and hyphens only (e.g. billing, api-v1).`
    );
  }
  return m;
}

/**
 * Write the standard Otavia cell tree under `cells/<mount>/` (cell.yaml, package.json, backend, frontend, tsconfig).
 * Template variables use legacy keys `helloMount` / `helloPkg` in assets.
 */
export function scaffoldCellFiles(
  monorepoRoot: string,
  mount: string,
  cellPkg: string,
  options: { force?: boolean }
): void {
  const cellDir = resolve(monorepoRoot, "cells", mount);
  const cellYamlPath = resolve(cellDir, "cell.yaml");
  if (existsSync(cellYamlPath) && !options.force) {
    throw new Error(`cells/${mount}/cell.yaml already exists. Use --force to overwrite.`);
  }

  mkdirSync(resolve(cellDir, "backend"), { recursive: true });
  mkdirSync(resolve(cellDir, "frontend"), { recursive: true });

  writeFileSync(
    cellYamlPath,
    loadRenderedTemplate("init/cell-hello/cell.yaml.tmpl", { helloMount: mount }),
    "utf-8"
  );

  writeJson(resolve(cellDir, "package.json"), {
    name: cellPkg,
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
      react: "^18.3.1",
      "react-dom": "^18.3.1",
      "@types/react": "^18.3.12",
      "@types/react-dom": "^18.3.1",
    },
  });

  writeFileSync(
    resolve(cellDir, "backend", "app.ts"),
    loadRenderedTemplate("init/cell-hello/backend/app.ts.tmpl", { helloPkg: cellPkg }),
    "utf-8"
  );

  writeFileSync(resolve(cellDir, "backend", "handler.ts"), loadTemplate("init/cell-hello/backend/handler.ts"), "utf-8");

  writeFileSync(
    resolve(cellDir, "frontend", "shell.tsx"),
    loadRenderedTemplate("init/cell-hello/frontend/shell.tsx.tmpl", { helloPkg: cellPkg }),
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
}
