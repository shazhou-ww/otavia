import { describe, expect, test } from "bun:test";
import type { DeployInput, HostAdapter } from "./types.ts";

const mockHost: HostAdapter = {
  providerId: "aws",
  async checkToolchain() {},
  async checkCredentials() {},
  async deployStack(_input: DeployInput) {},
};

describe("HostAdapter", () => {
  test("mock object satisfies interface at runtime", () => {
    expect(mockHost.providerId).toBe("aws");
    expect(typeof mockHost.checkToolchain).toBe("function");
    expect(typeof mockHost.checkCredentials).toBe("function");
    expect(typeof mockHost.deployStack).toBe("function");
  });
});
