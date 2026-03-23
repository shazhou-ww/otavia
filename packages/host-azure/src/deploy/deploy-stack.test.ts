import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deployAzureStack, sanitizeAzureDeploymentName } from "./deploy-stack.js";

describe("sanitizeAzureDeploymentName", () => {
  test("normalizes name", () => {
    expect(sanitizeAzureDeploymentName("My Deploy!")).toBe("my-deploy");
  });
});

describe("deployAzureStack", () => {
  test("writes bicep and params and runs az deployment group create", async () => {
    const root = await mkdtemp(join(tmpdir(), "otavia-az-"));
    try {
      const calls: string[][] = [];
      await deployAzureStack(
        {
          stackRoot: root,
          stackName: "Main",
          provider: { location: "eastus" },
          environments: { STAGE: "dev" },
          secrets: {},
          resourceGroup: "rg-test",
        },
        async (exe, args) => {
          calls.push([exe, ...args]);
          return { exitCode: 0, stdout: "", stderr: "" };
        }
      );

      const bicep = await readFile(join(root, ".otavia", "azure", "main.bicep"), "utf8");
      expect(bicep).toContain("targetScope = 'resourceGroup'");

      const paramsRaw = await readFile(join(root, ".otavia", "azure", "deploy-params.json"), "utf8");
      const params = JSON.parse(paramsRaw) as { envSettings: { value: Record<string, string> } };
      expect(params.envSettings.value.STAGE).toBe("dev");

      expect(calls.length).toBe(1);
      expect(calls[0][0]).toBe("az");
      expect(calls[0].slice(0, 3)).toEqual(["az", "deployment", "group"]);
      expect(calls[0]).toContain("--resource-group");
      expect(calls[0]).toContain("rg-test");
      const tfIdx = calls[0].indexOf("--template-file");
      expect(tfIdx).toBeGreaterThan(-1);
      expect(calls[0][tfIdx + 1]).toBe(join(root, ".otavia", "azure", "main.bicep"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("throws without location", async () => {
    await expect(
      deployAzureStack(
        {
          stackRoot: "/tmp/x",
          stackName: "x",
          provider: {},
          environments: {},
          secrets: {},
          resourceGroup: "rg",
        },
        async () => ({ exitCode: 0, stdout: "", stderr: "" })
      )
    ).rejects.toThrow(/location/);
  });

  test("throws without resource group", async () => {
    await expect(
      deployAzureStack(
        {
          stackRoot: "/tmp/x",
          stackName: "x",
          provider: { location: "eastus" },
          environments: {},
          secrets: {},
        },
        async () => ({ exitCode: 0, stdout: "", stderr: "" })
      )
    ).rejects.toThrow(/resourceGroup/);
  });
});
