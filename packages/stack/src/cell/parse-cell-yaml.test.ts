import { describe, expect, test } from "bun:test";
import { parseCellYaml } from "./parse-cell-yaml.js";

describe("parseCellYaml", () => {
  test("parses minimal cell", () => {
    const r = parseCellYaml(`
name: hello
params: []
backend:
  runtime: bun
  entries:
    api:
      handler: backend/handler.ts
      routes: []
`);
    expect(r.name).toBe("hello");
    expect(r.params).toEqual([]);
    expect(r.backend?.runtime).toBe("bun");
  });

  test("rejects !Env in body", () => {
    expect(() =>
      parseCellYaml(`
name: x
params: []
backend:
  x: !Env FOO
`)
    ).toThrow(/!Env/);
  });

  test("warns unknown keys", () => {
    const r = parseCellYaml(`
name: x
params: []
extra: true
`);
    expect(r.warnings.some((w) => w.includes("extra"))).toBe(true);
  });
});
