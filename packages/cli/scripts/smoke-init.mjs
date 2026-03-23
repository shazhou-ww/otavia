/**
 * Run with Bun from repo root: `bun run smoke:init` (uses process.execPath as the Bun binary).
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const cliRoot = join(root, "..");
const cliEntry = join(cliRoot, "src", "cli.ts");
const tmp = mkdtempSync(join(tmpdir(), "otavia-smoke-init-"));

try {
  const init = spawnSync(process.execPath, ["run", cliEntry, "init", tmp], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (init.status !== 0) process.exit(init.status ?? 1);

  const install = spawnSync(process.execPath, ["install", "--no-cache"], {
    cwd: tmp,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (install.status !== 0) process.exit(install.status ?? 1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
