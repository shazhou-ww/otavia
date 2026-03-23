import { describe, expect, test } from "bun:test";
import type { CloudPlatform } from "./index.js";

describe("runtime-contract", () => {
  test("CloudPlatform type is usable", () => {
    const p: CloudPlatform = "aws";
    expect(p).toBe("aws");
  });
});
