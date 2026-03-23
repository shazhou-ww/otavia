import { describe, expect, test } from "bun:test";
import type { YamlVarRef } from "../yaml/tags.js";
import { resolveCellMountParams } from "./resolve-cell-mount-params.js";

const vref = (k: string): YamlVarRef => ({ kind: "var", key: k });

describe("resolveCellMountParams", () => {
  const top = { A: "1", B: "two" };

  test("substitutes !Var from top-level keys", () => {
    expect(resolveCellMountParams({ x: vref("A"), y: vref("B") }, top)).toEqual({
      x: "1",
      y: "two",
    });
  });

  test("rejects !Var to unknown key", () => {
    expect(() => resolveCellMountParams({ x: vref("MISSING") }, top)).toThrow(/MISSING/);
  });

  test("rejects !Param", () => {
    expect(() =>
      resolveCellMountParams({ x: { kind: "param" as const, key: "A" } }, top)
    ).toThrow(/!Param/);
  });
});
