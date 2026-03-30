import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectDoctorChecks, formatDoctorOutput } from "./doctor.js";

const commandsDir = dirname(fileURLToPath(import.meta.url));
const cliEntry = join(commandsDir, "../cli.ts");

describe("formatDoctorOutput", () => {
  test("formats pass and fail correctly", () => {
    const checks = [
      { name: "Bun", pass: true, detail: "v1.2.0" },
      { name: "AWS CLI", pass: false, detail: "not found" },
    ];
    const output = formatDoctorOutput(checks);
    expect(output).toContain("✅");
    expect(output).toContain("❌");
    expect(output).toContain("Bun");
    expect(output).toContain("v1.2.0");
    expect(output).toContain("AWS CLI");
    expect(output).toContain("not found");
    expect(output).toContain("1 passed, 1 failed");
  });
});

describe("collectDoctorChecks", () => {
  test("returns array of check results", () => {
    const checks = collectDoctorChecks(process.cwd());
    expect(Array.isArray(checks)).toBe(true);
    expect(checks.length).toBeGreaterThanOrEqual(4);
    for (const check of checks) {
      expect(check).toHaveProperty("name");
      expect(check).toHaveProperty("pass");
      expect(check).toHaveProperty("detail");
      expect(typeof check.pass).toBe("boolean");
    }
  });

  test("detects bun as available (since we are running in bun)", () => {
    const checks = collectDoctorChecks(process.cwd());
    const bunCheck = checks.find((c) => c.name === "Bun");
    expect(bunCheck).toBeDefined();
    expect(bunCheck!.pass).toBe(true);
  });
});

describe("otavia doctor CLI", () => {
  test("runs successfully outside workspace", async () => {
    const dir = await mkdtemp(join(tmpdir(), "otavia-doctor-"));
    try {
      const result = spawnSync("bun", ["run", cliEntry, "doctor"], {
        cwd: dir,
        encoding: "utf-8",
        timeout: 15000,
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Otavia Doctor");
      expect(result.stdout).toContain("❌");
      expect(result.stdout).toContain("Otavia workspace");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("all checks have results inside workspace", () => {
    const fixtureWs = join(commandsDir, "../../../stack/test-fixtures/minimal-workspace");
    const result = spawnSync("bun", ["run", cliEntry, "doctor"], {
      cwd: join(fixtureWs, "stacks", "main"),
      encoding: "utf-8",
      timeout: 15000,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Otavia Doctor");
    expect(result.stdout).toContain("passed");
  });
});
