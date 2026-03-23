import { describe, expect, test } from "bun:test";
import type { YamlEnvRef, YamlSecretRef, YamlVarRef } from "../yaml/tags.js";
import { flattenVariablePaths, topologicalVariableOrder } from "./graph.js";
import { resolveTopVariables } from "./resolve-top-variables.js";

const env = (k: string): YamlEnvRef => ({ kind: "env", key: k });
const secret = (k: string): YamlSecretRef => ({ kind: "secret", key: k });
const vref = (k: string): YamlVarRef => ({ kind: "var", key: k });

describe("flattenVariablePaths", () => {
  test("nested paths", () => {
    const m = flattenVariablePaths({ a: 1, b: { c: "x" } });
    expect([...m.entries()].sort((x, y) => x[0].localeCompare(y[0]))).toEqual([
      ["a", 1],
      ["b.c", "x"],
    ]);
  });
});

describe("topologicalVariableOrder", () => {
  test("detects cycle", () => {
    const flat = new Map<string, unknown>([
      ["a", vref("b")],
      ["b", vref("a")],
    ]);
    expect(() => topologicalVariableOrder(flat)).toThrow(/cyclic/);
  });

  test("linear order", () => {
    const flat = new Map<string, unknown>([
      ["base", "ok"],
      ["derived", vref("base")],
    ]);
    expect(topologicalVariableOrder(flat)).toEqual(["base", "derived"]);
  });
});

describe("resolveTopVariables", () => {
  test("empty variables", () => {
    expect(resolveTopVariables(undefined, {})).toEqual({
      values: {},
      environments: [],
      secrets: [],
    });
  });

  test("resolves !Env and records binding", () => {
    const r = resolveTopVariables({ A: env("FOO") }, { FOO: "bar" });
    expect(r.values.A).toBe("bar");
    expect(r.environments).toEqual([{ logicalKey: "A", envVarName: "FOO" }]);
  });

  test("resolves !Var chain", () => {
    const r = resolveTopVariables(
      {
        base: "1",
        mid: vref("base"),
        top: vref("mid"),
      },
      {}
    );
    expect(r.values).toEqual({ base: "1", mid: "1", top: "1" });
  });

  test("!Var to missing tree key uses processEnv", () => {
    const r = resolveTopVariables({ a: vref("ONLY_ENV") }, { ONLY_ENV: "from-env" });
    expect(r.values.a).toBe("from-env");
  });

  test("throws when !Env missing in processEnv", () => {
    expect(() => resolveTopVariables({ a: env("MISSING") }, {})).toThrow(/MISSING/);
  });
});
