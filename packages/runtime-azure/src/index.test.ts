import { describe, expect, test } from "bun:test";
import { platform } from "./index.js";

describe("runtime-azure", () => {
  test("platform", () => {
    expect(platform()).toBe("azure");
  });
});
