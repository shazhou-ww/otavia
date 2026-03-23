import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildStackModel } from "./build-stack-model.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureWs = join(__dirname, "../test-fixtures/minimal-workspace");
const fixtureStackRoot = join(fixtureWs, "stacks/main");

describe("buildStackModel", () => {
  test("builds model from minimal workspace fixture", () => {
    const model = buildStackModel({
      stackRoot: fixtureStackRoot,
      env: { ...process.env } as Record<string, string>,
    });

    expect(model.name).toBe("main");
    expect(model.cellMountOrder).toEqual(["hello"]);
    expect(model.resourceTables).toEqual({});
    expect(model.providerKind).toBe("aws");
    expect(model.workspaceRootAbs.replace(/\\/g, "/")).toMatch(/minimal-workspace$/);

    const hello = model.cells.hello;
    expect(hello).toBeDefined();
    expect(hello.name).toBe("hello");
    expect(hello.packageName).toBe("@fixture/hello");

    const be = hello.backend as Record<string, unknown>;
    const entries = be.entries as Record<string, Record<string, unknown>>;
    expect(entries.api.handler).toBe("../../cells/hello/handler.ts");
  });
});
