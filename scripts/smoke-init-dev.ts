/**
 * Smoke test: scaffold with initCommand, install deps, run dev briefly, hit gateway + Vite.
 * Run from repo root: bun run smoke:init-dev
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { initCommand } from "../src/commands/init";

/** Repo root (parent of scripts/). */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function logSection(title: string): void {
  console.log(`\n--- ${title} ---`);
}

function treeSummary(root: string, rel = "", depth = 0): void {
  if (depth > 4) return;
  const full = join(root, rel);
  let st: ReturnType<typeof statSync>;
  try {
    st = statSync(full);
  } catch {
    return;
  }
  const pad = "  ".repeat(depth);
  if (st.isDirectory()) {
    console.log(`${pad}${rel || "."}/`);
    const names = readdirSync(full).filter((n) => !n.startsWith(".")).sort();
    for (const n of names.slice(0, 20)) {
      treeSummary(root, rel ? `${rel}/${n}` : n, depth + 1);
    }
    if (names.length > 20) console.log(`${pad}  ... (${names.length - 20} more)`);
  } else {
    console.log(`${pad}${rel}`);
  }
}

async function main(): Promise<void> {
  logSection("build:runtime (dist JS for package exports)");
  const buildRt = Bun.spawnSync(["bun", "run", "build:runtime"], {
    cwd: repoRoot,
    stderr: "inherit",
    stdout: "inherit",
  });
  if (buildRt.exitCode !== 0) {
    throw new Error(`build:runtime failed with code ${buildRt.exitCode}`);
  }

  const root = mkdtempSync(join(tmpdir(), "otavia-smoke-"));
  const portBase = 7920;
  const backendPort = portBase + 1900;
  const vitePort = portBase + 100;

  try {
    logSection("init");
    initCommand(root, {
      packageScope: "@smoke",
      stackName: "smoke-stack",
      domain: "smoke.example.dev",
    });

    logSection("scaffold layout (partial)");
    treeSummary(root);

    logSection("read key files");
    const rootPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8")) as {
      workspaces?: string[];
      devDependencies?: Record<string, string>;
    };
    console.log("root workspaces:", rootPkg.workspaces);
    console.log("root has vite:", Boolean(rootPkg.devDependencies?.vite));
    const helloPkg = JSON.parse(readFileSync(join(root, "cells", "hello", "package.json"), "utf-8")) as {
      devDependencies?: Record<string, string>;
    };
    console.log("hello cell react:", helloPkg.devDependencies?.react);

    logSection("point otavia devDependency at this repo");
    rootPkg.devDependencies = rootPkg.devDependencies ?? {};
    rootPkg.devDependencies.otavia = `file:${repoRoot}`;
    writeFileSync(join(root, "package.json"), `${JSON.stringify(rootPkg, null, 2)}\n`, "utf-8");

    logSection("bun install --no-cache");
    const install = Bun.spawnSync(["bun", "install", "--no-cache"], {
      cwd: root,
      stderr: "inherit",
      stdout: "inherit",
    });
    if (install.exitCode !== 0) {
      throw new Error(`bun install failed with code ${install.exitCode}`);
    }

    writeFileSync(join(root, "apps", "main", ".env"), `PORT_BASE=${portBase}\n`, "utf-8");

    logSection(`bun run dev (ports backend=${backendPort}, vite=${vitePort})`);
    const devProc = Bun.spawn(["bun", "run", "dev"], {
      cwd: root,
      env: {
        ...process.env,
        OTAVIA_SKIP_AWS_CHECK: "1",
      },
      stdout: "inherit",
      stderr: "inherit",
    });

    let gatewayOk = false;
    let viteOk = false;
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      await Bun.sleep(800);
      if (!gatewayOk) {
        try {
          const r = await fetch(`http://127.0.0.1:${backendPort}/hello/api/hello`);
          if (r.ok) {
            const j = (await r.json()) as { message?: string };
            console.log("[smoke] gateway OK:", j);
            gatewayOk = true;
          }
        } catch {
          /* still starting */
        }
      }
      if (!viteOk) {
        try {
          const r = await fetch(`http://127.0.0.1:${vitePort}/`, { redirect: "manual" });
          if (r.status === 200 || r.status === 301 || r.status === 302) {
            console.log("[smoke] vite OK: HTTP", r.status);
            viteOk = true;
          }
        } catch {
          /* still starting */
        }
      }
      if (gatewayOk && viteOk) break;
    }

    try {
      devProc.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    await devProc.exited;

    if (!gatewayOk || !viteOk) {
      throw new Error(
        `Smoke timeout: gatewayOk=${gatewayOk} viteOk=${viteOk} (backend ${backendPort}, vite ${vitePort})`
      );
    }

    logSection("smoke passed");
  } finally {
    rmSync(root, { recursive: true, force: true });
    console.log("(removed temp dir)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
