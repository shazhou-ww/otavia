import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const stackRoot = join(import.meta.dir, "..", "..");

describe("stack (unit)", () => {
  test("otavia.yaml names stack and declares cloud", () => {
    const raw = readFileSync(join(stackRoot, "otavia.yaml"), "utf8");
    expect(raw).toMatch(/name:\s*main/);
    expect(raw).toMatch(/cloud:/);
    expect(raw).toMatch(/provider:\s*aws/);
  });
});
