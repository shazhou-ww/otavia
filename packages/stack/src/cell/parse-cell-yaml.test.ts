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

  // ── cell.yaml 验收测试 ──────────────────────────────────────────────

  describe("acceptance: cell.yaml design points", () => {
    test("DP-1: 顶层 key 完整性 — all known top-level keys parse without warnings", () => {
      const r = parseCellYaml(`
name: fullcell
variables:
  FOO: bar
params:
  - region
backend:
  runtime: bun
  dir: backend
  entries:
    api:
      entry: app.ts
      routes:
        - /hello
frontend:
  build: dist
tables:
  users:
    primaryKey: id
buckets:
  blob: {}
oauth:
  scopes:
    - read
    - write
testing:
  unit: backend/
`);
      expect(r.name).toBe("fullcell");
      expect(r.variables).toEqual({ FOO: "bar" });
      expect(r.params).toEqual(["region"]);
      expect(r.backend).toBeDefined();
      expect(r.backend!.runtime).toBe("bun");
      expect(r.frontend).toBeDefined();
      expect(r.tables).toBeDefined();
      expect(r.tables!.users).toBeDefined();
      expect(r.buckets).toBeDefined();
      expect(r.buckets!.blob).toBeDefined();
      expect(r.oauth).toEqual({ scopes: ["read", "write"] });
      expect(r.testing).toBeDefined();
      expect(r.testing!.unit).toBe("backend/");
      expect(r.warnings).toEqual([]);
    });

    test("DP-2: variables 支持 — variables: { FOO: bar } parsed correctly", () => {
      const r = parseCellYaml(`
name: vars
params: []
variables:
  FOO: bar
  DB_URL: postgres://localhost/db
`);
      expect(r.variables).toEqual({ FOO: "bar", DB_URL: "postgres://localhost/db" });
      expect(r.warnings).toEqual([]);
    });

    test("DP-3: buckets 支持 — buckets: { blob: {} } parsed correctly", () => {
      const r = parseCellYaml(`
name: bucketcell
params: []
buckets:
  blob: {}
  assets:
    public: true
`);
      expect(r.buckets).toBeDefined();
      expect(r.buckets!.blob).toEqual({});
      expect(r.buckets!.assets).toEqual({ public: true });
      expect(r.warnings).toEqual([]);
    });

    test("DP-4: testing 支持 — testing: { unit: backend/ } parsed correctly", () => {
      const r = parseCellYaml(`
name: testcell
params: []
testing:
  unit: backend/
`);
      expect(r.testing).toBeDefined();
      expect(r.testing!.unit).toBe("backend/");
      expect(r.warnings).toEqual([]);
    });

    test("DP-5: oauth 简化 — only scopes extracted, role/enabled produce warnings", () => {
      const r = parseCellYaml(`
name: oauthcell
params: []
oauth:
  scopes:
    - read
    - write
`);
      expect(r.oauth).toEqual({ scopes: ["read", "write"] });
      expect(r.warnings).toEqual([]);

      const r2 = parseCellYaml(`
name: oauthcell
params: []
oauth:
  scopes:
    - read
  role: admin
  enabled: true
`);
      expect(r2.oauth).toEqual({ scopes: ["read"] });
      expect(r2.warnings.some((w) => w.includes("role"))).toBe(true);
      expect(r2.warnings.some((w) => w.includes("enabled"))).toBe(true);
    });

    test("DP-6: entry 统一 — backend entries use entry: (not handler:)", () => {
      const r = parseCellYaml(`
name: entrycell
params: []
backend:
  runtime: bun
  entries:
    api:
      entry: app.ts
      routes:
        - /api
`);
      expect(r.backend).toBeDefined();
      const api = (r.backend!.entries as Record<string, Record<string, unknown>>).api;
      expect(api.entry).toBe("app.ts");
      expect(r.warnings).toEqual([]);
    });

    test("DP-7: backend.dir — dir field parsed correctly", () => {
      const r = parseCellYaml(`
name: dircell
params: []
backend:
  runtime: bun
  dir: backend
  entries:
    api:
      entry: handler.ts
      routes: []
`);
      expect(r.backend).toBeDefined();
      expect(r.backend!.dir).toBe("backend");
      expect(r.warnings).toEqual([]);
    });

    test("DP-8: 部署参数拒绝 — timeout/memory in entry throws", () => {
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

    test("DP-9: handler 拒绝 — using handler instead of entry produces warning", () => {
      const r = parseCellYaml(`
name: x
params: []
backend:
  runtime: bun
  entries:
    api:
      handler: app.ts
      routes: []
`);
      expect(r.warnings.some((w) => w.includes("handler"))).toBe(true);
    });

    test("DP-10: !Env/!Secret 拒绝 — !Env and !Secret throw in cell.yaml", () => {
      expect(() =>
        parseCellYaml(`
name: x
params: []
backend:
  val: !Env FOO
`)
      ).toThrow(/!Env/);

      expect(() =>
        parseCellYaml(`
name: x
params: []
backend:
  key: !Secret MY_KEY
`)
      ).toThrow(/!Secret/);
    });
  });
});
