import { describe, expect, test } from "bun:test";
import type { YamlParamRef, YamlVarRef } from "../yaml/tags.js";
import { resolveCellVariables } from "./resolve-cell-variables.js";

const pref = (k: string): YamlParamRef => ({ kind: "param", key: k });
const vref = (k: string): YamlVarRef => ({ kind: "var", key: k });

describe("resolveCellVariables", () => {
  test("!Param from merged stack params", () => {
    const v = resolveCellVariables({ a: pref("TOKEN") }, { TOKEN: "secret" }, {});
    expect(v.a).toBe("secret");
  });

  test("!Var chain inside variables", () => {
    const v = resolveCellVariables(
      { base: "x", derived: vref("base") },
      {},
      {}
    );
    expect(v).toEqual({ base: "x", derived: "x" });
  });

  test("cycle throws", () => {
    expect(() =>
      resolveCellVariables({ a: vref("b"), b: vref("a") }, {}, {})
    ).toThrow(/cyclic/);
  });
});
