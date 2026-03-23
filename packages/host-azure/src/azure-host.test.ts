import { describe, expect, test } from "bun:test";
import { createAzureHost } from "./azure-host.js";

describe("createAzureHost", () => {
  test("checkToolchain invokes az version and az bicep version", async () => {
    const calls: string[][] = [];
    const host = createAzureHost({
      run: async (exe, args) => {
        calls.push([exe, ...args]);
        if (args[0] === "version" && args.length === 1) {
          return { exitCode: 0, stdout: "{}", stderr: "" };
        }
        if (args[0] === "bicep" && args[1] === "version") {
          return { exitCode: 0, stdout: "0.24.0", stderr: "" };
        }
        return { exitCode: 1, stdout: "", stderr: "unexpected" };
      },
    });
    await host.checkToolchain();
    expect(calls[0]).toEqual(["az", "version"]);
    expect(calls[1]).toEqual(["az", "bicep", "version"]);
  });

  test("checkToolchain falls back to standalone bicep when az bicep fails", async () => {
    const calls: string[][] = [];
    const host = createAzureHost({
      run: async (exe, args) => {
        calls.push([exe, ...args]);
        if (exe === "az" && args[0] === "version") {
          return { exitCode: 0, stdout: "{}", stderr: "" };
        }
        if (exe === "az" && args[0] === "bicep") {
          return { exitCode: 1, stdout: "", stderr: "no bicep" };
        }
        if (exe === "bicep" && args[0] === "--version") {
          return { exitCode: 0, stdout: "Bicep CLI 0.24", stderr: "" };
        }
        return { exitCode: 1, stdout: "", stderr: "unexpected" };
      },
    });
    await host.checkToolchain();
    expect(calls.some((c) => c[0] === "bicep" && c[1] === "--version")).toBe(true);
  });

  test("checkCredentials invokes az account show", async () => {
    const calls: string[][] = [];
    const host = createAzureHost({
      run: async (exe, args) => {
        calls.push([exe, ...args]);
        return { exitCode: 0, stdout: "{}", stderr: "" };
      },
    });
    await host.checkCredentials();
    expect(calls).toEqual([["az", "account", "show"]]);
  });
});

describe("createAzureHost integration (optional)", () => {
  test.skipIf(process.env.OTAVIA_AZURE_INTEGRATION !== "1")(
    "real az CLI when OTAVIA_AZURE_INTEGRATION=1",
    async () => {
      const host = createAzureHost();
      await host.checkToolchain();
      await host.checkCredentials();
    }
  );
});
