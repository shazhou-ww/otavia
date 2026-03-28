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
      entry: backend/handler.ts
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

  test("parses tables field", () => {
    const r = parseCellYaml(`
name: myapp
params: []
tables:
  users:
    primaryKey: id
    attributes:
      id: string
      email: string
`);
    expect(r.tables).toBeDefined();
    expect(r.tables!.users).toBeDefined();
    expect(r.warnings).toEqual([]);
  });

  test("rejects tables when not an object", () => {
    expect(() =>
      parseCellYaml(`
name: x
params: []
tables: "invalid"
`)
    ).toThrow(/'tables' must be an object/);
  });

  test("parses oauth field", () => {
    const r = parseCellYaml(`
name: myapp
params: []
oauth:
  scopes:
    - openid
    - email
`);
    expect(r.oauth).toBeDefined();
    expect(r.oauth!.scopes).toEqual(["openid", "email"]);
    expect(r.warnings).toEqual([]);
  });

  test("rejects oauth when not an object", () => {
    expect(() =>
      parseCellYaml(`
name: x
params: []
oauth: true
`)
    ).toThrow(/'oauth' must be an object/);
  });

  test("parses cell with all fields", () => {
    const r = parseCellYaml(`
name: fullapp
params:
  - region
backend:
  runtime: bun
  dir: src/backend
  entries:
    api:
      entry: handler.ts
      routes:
        - /api/users
frontend:
  build: dist
tables:
  sessions:
    primaryKey: sid
oauth:
  scopes:
    - openid
variables:
  API_URL: https://api.example.com
buckets:
  uploads:
    public: true
testing:
  seed: fixtures/seed.json
`);
    expect(r.name).toBe("fullapp");
    expect(r.params).toEqual(["region"]);
    expect(r.backend).toBeDefined();
    expect(r.backend!.dir).toBe("src/backend");
    expect(r.frontend).toBeDefined();
    expect(r.tables).toBeDefined();
    expect(r.oauth).toEqual({ scopes: ["openid"] });
    expect(r.variables).toBeDefined();
    expect(r.buckets).toBeDefined();
    expect(r.testing).toBeDefined();
    expect(r.warnings).toEqual([]);
  });

  test("rejects deploy-time parameters in backend.entries", () => {
    expect(() =>
      parseCellYaml(`
name: x
params: []
backend:
  runtime: bun
  entries:
    api:
      entry: handler.ts
      routes: []
      timeout: 30
`)
    ).toThrow(/timeout.*deploy-time/);
  });

  test("rejects memory in backend.entries", () => {
    expect(() =>
      parseCellYaml(`
name: x
params: []
backend:
  runtime: bun
  entries:
    api:
      entry: handler.ts
      routes: []
      memory: 512
`)
    ).toThrow(/memory.*deploy-time/);
  });

  test("warns unknown keys in backend.entries", () => {
    const r = parseCellYaml(`
name: x
params: []
backend:
  runtime: bun
  entries:
    api:
      entry: handler.ts
      routes: []
      description: "some desc"
`);
    expect(r.warnings.some((w) => w.includes("description"))).toBe(true);
  });

  test("rejects deploy-time parameters in frontend.entries", () => {
    expect(() =>
      parseCellYaml(`
name: x
params: []
frontend:
  entries:
    web:
      entry: index.ts
      routes: []
      timeout: 30
`)
    ).toThrow(/timeout.*deploy-time/);
  });

  test("rejects memory in frontend.entries", () => {
    expect(() =>
      parseCellYaml(`
name: x
params: []
frontend:
  entries:
    web:
      entry: index.ts
      memory: 512
`)
    ).toThrow(/memory.*deploy-time/);
  });

  test("warns unknown keys in frontend.entries", () => {
    const r = parseCellYaml(`
name: x
params: []
frontend:
  entries:
    web:
      entry: index.ts
      routes: []
      label: "some label"
`);
    expect(r.warnings.some((w) => w.includes("label") && w.includes("frontend"))).toBe(true);
  });

  test("rejects non-string variable values", () => {
    expect(() =>
      parseCellYaml(`
name: x
params: []
variables:
  PORT: 3000
`)
    ).toThrow(/variables\.PORT must be a string/);
  });

  test("rejects array variable values", () => {
    expect(() =>
      parseCellYaml(`
name: x
params: []
variables:
  ITEMS:
    - a
    - b
`)
    ).toThrow(/variables\.ITEMS must be a string/);
  });
});
