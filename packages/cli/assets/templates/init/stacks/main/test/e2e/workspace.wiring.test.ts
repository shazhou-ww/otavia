import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const stackRoot = join(import.meta.dir, "..", "..");

describe("stack (e2e wiring)", () => {
  test("package.json links hello cell workspace dependency", () => {
    const pkg = JSON.parse(readFileSync(join(stackRoot, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.["@demo/hello"]).toBe("workspace:*");
  });
});
