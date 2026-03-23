import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCellPackageDir } from "./resolve-cell-package-dir.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureStackRoot = join(__dirname, "../../test-fixtures/minimal-workspace/stacks/main");

describe("resolveCellPackageDir", () => {
  test("resolves workspace-linked cell package directory", () => {
    const dir = resolveCellPackageDir(fixtureStackRoot, "@fixture/hello");
    expect(dir.replace(/\\/g, "/")).toMatch(/cells\/hello$/);
  });
});
