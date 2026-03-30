import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatStatusOutput } from "./status.js";
import type { StackModel } from "@otavia/stack";

const commandsDir = dirname(fileURLToPath(import.meta.url));
const cliEntry = join(commandsDir, "../cli.ts");

describe("formatStatusOutput", () => {
  test("formats a model with cells correctly", () => {
    const model = {
      stackRootAbs: "/tmp/stack",
      workspaceRootAbs: "/tmp",
      name: "main",
      providerKind: "aws" as const,
      cloud: { provider: "aws" as const, region: "us-east-1" },
      topLevelVariableValues: {},
      environments: [],
      secrets: [],
      cellMountOrder: ["api", "web"],
      cells: {
        api: {
          mount: "api",
          packageName: "@app/api",
          packageRootAbs: "/tmp/cells/api",
          name: "api",
          mergedStackParams: {},
          cellVariableValues: {},
          backend: { runtime: "bun" },
          frontend: undefined,
        },
        web: {
          mount: "web",
          packageName: "@app/web",
          packageRootAbs: "/tmp/cells/web",
          name: "web",
          mergedStackParams: {},
          cellVariableValues: {},
          backend: undefined,
          frontend: { entries: {} },
        },
      },
      resourceTables: {},
      warnings: [],
    } as unknown as StackModel;

    const output = formatStatusOutput(model, "/tmp/nonexistent-stack");
    expect(output).toContain("Stack:     main");
    expect(output).toContain("Provider:  aws");
    expect(output).toContain("Region:    us-east-1");
    expect(output).toContain("api");
    expect(output).toContain("@app/api");
    expect(output).toContain("web");
    expect(output).toContain("@app/web");
    expect(output).toContain(".env missing");
  });

  test("shows (none) when no cells", () => {
    const model = {
      stackRootAbs: "/tmp/stack",
      workspaceRootAbs: "/tmp",
      name: "empty",
      providerKind: "aws" as const,
      cloud: { provider: "aws" as const, region: "eu-west-1" },
      topLevelVariableValues: {},
      environments: [],
      secrets: [],
      cellMountOrder: [],
      cells: {},
      resourceTables: {},
      warnings: [],
    } as unknown as StackModel;

    const output = formatStatusOutput(model, "/tmp/nonexistent");
    expect(output).toContain("(none)");
  });
});

describe("otavia status CLI", () => {
  test("prints friendly message outside workspace", async () => {
    const dir = await mkdtemp(join(tmpdir(), "otavia-status-"));
    try {
      const result = spawnSync("bun", ["run", cliEntry, "status"], {
        cwd: dir,
        encoding: "utf-8",
        timeout: 15000,
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Not inside an Otavia workspace");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("outputs stack info in minimal-workspace fixture", () => {
    const fixtureWs = join(commandsDir, "../../../stack/test-fixtures/minimal-workspace");
    // Ensure bun install has run
    spawnSync("bun", ["install", "--no-cache"], {
      cwd: fixtureWs,
      shell: true,
      encoding: "utf-8",
    });

    const result = spawnSync("bun", ["run", cliEntry, "status"], {
      cwd: join(fixtureWs, "stacks", "main"),
      encoding: "utf-8",
      timeout: 15000,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Stack:     main");
    expect(result.stdout).toContain("Provider:  aws");
    expect(result.stdout).toContain("Region:    us-east-1");
    expect(result.stdout).toContain("hello");
  });
});
