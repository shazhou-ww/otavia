import { describe, expect, test } from "bun:test";
import { platform } from "./index.js";

describe("runtime-aws", () => {
  test("platform", () => {
    expect(platform()).toBe("aws");
  });
});
