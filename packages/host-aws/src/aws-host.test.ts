import { describe, expect, test } from "bun:test";
import { OtaviaCredentialUserError } from "@otavia/host-contract";
import { createAwsHost } from "./aws-host.js";

describe("createAwsHost", () => {
  test("checkToolchain invokes aws --version", async () => {
    const calls: string[][] = [];
    const host = createAwsHost({
      run: async (exe, args) => {
        calls.push([exe, ...args]);
        return { exitCode: 0, stdout: "aws-cli/2.0.0\n", stderr: "" };
      },
    });
    await host.checkToolchain();
    expect(calls).toEqual([["aws", "--version"]]);
  });

  test("checkToolchain throws when aws exits non-zero", async () => {
    const host = createAwsHost({
      run: async () => ({ exitCode: 127, stdout: "", stderr: "not found" }),
    });
    await expect(host.checkToolchain()).rejects.toThrow(/toolchain check failed/);
  });

  test("checkCredentials invokes sts get-caller-identity", async () => {
    const calls: string[][] = [];
    const host = createAwsHost({
      run: async (exe, args) => {
        calls.push([exe, ...args]);
        return { exitCode: 0, stdout: "{}", stderr: "" };
      },
    });
    await host.checkCredentials();
    expect(calls).toEqual([["aws", "sts", "get-caller-identity"]]);
  });

  test("checkCredentials throws OtaviaCredentialUserError with configure hint", async () => {
    const host = createAwsHost({
      run: async () => ({
        exitCode: 255,
        stdout: "",
        stderr: "Unable to locate credentials",
      }),
    });
    let err: unknown;
    try {
      await host.checkCredentials();
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(OtaviaCredentialUserError);
    expect((err as Error).message).toContain("aws configure");
  });
});

describe("createAwsHost integration (optional)", () => {
  test.skipIf(process.env.OTAVIA_AWS_INTEGRATION !== "1")(
    "real aws CLI when OTAVIA_AWS_INTEGRATION=1",
    async () => {
      const host = createAwsHost();
      await host.checkToolchain();
      await host.checkCredentials();
    }
  );
});
