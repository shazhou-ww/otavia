import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { cwd } from "node:process";
import { join } from "node:path";
import { findWorkspaceRoot } from "../resolve/find-workspace-root.js";

type CheckResult = {
  name: string;
  pass: boolean;
  detail: string;
};

function checkBunVersion(): CheckResult {
  try {
    const result = spawnSync("bun", ["--version"], { encoding: "utf-8", timeout: 5000 });
    if (result.status !== 0 || !result.stdout) {
      return { name: "Bun", pass: false, detail: "not found" };
    }
    const version = result.stdout.trim();
    const major = Number.parseInt(version.split(".")[0], 10);
    if (Number.isNaN(major) || major < 1) {
      return { name: "Bun", pass: false, detail: `v${version} (need >= 1.0)` };
    }
    return { name: "Bun", pass: true, detail: `v${version}` };
  } catch {
    return { name: "Bun", pass: false, detail: "not found" };
  }
}

function checkAwsCli(): CheckResult {
  try {
    const result = spawnSync("aws", ["--version"], { encoding: "utf-8", timeout: 5000 });
    if (result.status !== 0 || (!result.stdout && !result.stderr)) {
      return { name: "AWS CLI", pass: false, detail: "not found" };
    }
    // aws --version outputs to stdout (v2) or stderr (v1)
    const output = (result.stdout || result.stderr).trim().split("\n")[0];
    return { name: "AWS CLI", pass: true, detail: output };
  } catch {
    return { name: "AWS CLI", pass: false, detail: "not found" };
  }
}

function checkNodeModules(workspaceRoot: string | null): CheckResult {
  if (workspaceRoot == null) {
    return { name: "node_modules", pass: false, detail: "not in workspace" };
  }
  const nmPath = join(workspaceRoot, "node_modules");
  if (existsSync(nmPath)) {
    return { name: "node_modules", pass: true, detail: "present" };
  }
  return { name: "node_modules", pass: false, detail: `missing at ${nmPath}` };
}

function checkTypeScript(): CheckResult {
  try {
    const result = spawnSync("bun", ["x", "tsc", "--version"], {
      encoding: "utf-8",
      timeout: 10000,
    });
    if (result.status !== 0 || !result.stdout) {
      return { name: "TypeScript", pass: false, detail: "not available" };
    }
    const version = result.stdout.trim();
    return { name: "TypeScript", pass: true, detail: version };
  } catch {
    return { name: "TypeScript", pass: false, detail: "not available" };
  }
}

function checkOtaviaWorkspace(workspaceRoot: string | null): CheckResult {
  if (workspaceRoot != null) {
    return { name: "Otavia workspace", pass: true, detail: workspaceRoot };
  }
  return { name: "Otavia workspace", pass: false, detail: "not found (run from inside a workspace)" };
}

export function collectDoctorChecks(cwdInput: string): CheckResult[] {
  const workspaceRoot = findWorkspaceRoot(cwdInput);
  return [
    checkOtaviaWorkspace(workspaceRoot),
    checkBunVersion(),
    checkAwsCli(),
    checkNodeModules(workspaceRoot),
    checkTypeScript(),
  ];
}

export function formatDoctorOutput(checks: CheckResult[]): string {
  const lines: string[] = [];
  lines.push("Otavia Doctor");
  lines.push("");

  for (const check of checks) {
    const icon = check.pass ? "\u2705" : "\u274C";
    lines.push(`  ${icon} ${check.name.padEnd(20)} ${check.detail}`);
  }

  const passed = checks.filter((c) => c.pass).length;
  const failed = checks.length - passed;
  lines.push("");
  lines.push(`${passed} passed, ${failed} failed`);

  return lines.join("\n");
}

export function runDoctor(cwdInput: string = cwd()): void {
  const checks = collectDoctorChecks(cwdInput);
  console.log(formatDoctorOutput(checks));
}
