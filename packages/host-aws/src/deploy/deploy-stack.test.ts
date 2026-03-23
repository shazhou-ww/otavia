import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deployAwsStack, sanitizeCloudFormationStackName } from "./deploy-stack.js";

describe("sanitizeCloudFormationStackName", () => {
  test("lowercases and replaces invalid chars", () => {
    expect(sanitizeCloudFormationStackName("My Stack!")).toBe("my-stack");
  });
});

describe("deployAwsStack", () => {
  test("writes template and runs aws cloudformation deploy", async () => {
    const root = await mkdtemp(join(tmpdir(), "otavia-aws-"));
    try {
      const calls: string[][] = [];
      await deployAwsStack(
        {
          stackRoot: root,
          stackName: "TestStack",
          provider: { region: "us-east-1" },
          environments: { STAGE: "dev" },
          secrets: {},
        },
        async (exe, args) => {
          calls.push([exe, ...args]);
          return { exitCode: 0, stdout: "", stderr: "" };
        }
      );

      const tpl = await readFile(join(root, ".otavia", "aws", "template.yaml"), "utf8");
      expect(tpl).toContain("STAGE:");
      expect(tpl).toContain("HelloFn");

      expect(calls.length).toBe(1);
      expect(calls[0][0]).toBe("aws");
      expect(calls[0].slice(0, 3)).toEqual(["aws", "cloudformation", "deploy"]);
      expect(calls[0]).toContain("--stack-name");
      expect(calls[0]).toContain("teststack");
      expect(calls[0]).toContain("--region");
      expect(calls[0]).toContain("us-east-1");
      const tfIdx = calls[0].indexOf("--template-file");
      expect(tfIdx).toBeGreaterThan(-1);
      expect(calls[0][tfIdx + 1]).toBe(join(root, ".otavia", "aws", "template.yaml"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("throws without region", async () => {
    await expect(
      deployAwsStack(
        {
          stackRoot: "/tmp/x",
          stackName: "x",
          provider: {},
          environments: {},
          secrets: {},
        },
        async () => ({ exitCode: 0, stdout: "", stderr: "" })
      )
    ).rejects.toThrow(/region/);
  });
});
