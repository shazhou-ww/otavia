import { describe, expect, test } from "bun:test";
import { parseOtaviaYaml, providerKind } from "./parse-otavia-yaml.js";
import { isVarRef } from "../yaml/tags.js";

const MINIMAL = `
name: demo
cloud:
  provider: aws
  region: us-east-1
variables: {}
cells:
  hello: "@acme/hello"
`;

describe("parseOtaviaYaml", () => {
  test("parses minimal valid document", () => {
    const r = parseOtaviaYaml(MINIMAL);
    expect(r.name).toBe("demo");
    expect(r.cloud).toEqual({ provider: "aws", region: "us-east-1" });
    expect(r.cells.hello).toBe("@acme/hello");
    expect(r.cellsList).toEqual([{ mount: "hello", package: "@acme/hello" }]);
    expect(r.resourceTables).toEqual({});
    expect(r.warnings).toEqual([]);
  });

  test("parses resources.tables", () => {
    const r = parseOtaviaYaml(`
name: demo
cloud:
  provider: aws
  region: us-east-1
variables: {}
cells:
  hello: "@acme/hello"
resources:
  tables:
    settings:
      partitionKey: pk
      rowKey: sk
`);
    expect(r.resourceTables.settings).toEqual({ partitionKey: "pk", rowKey: "sk" });
  });

  test("warns on unknown top-level keys", () => {
    const r = parseOtaviaYaml(`
${MINIMAL}
experimental: true
`);
    expect(r.warnings.some((w) => w.includes("experimental"))).toBe(true);
  });

  test("rejects !Param anywhere", () => {
    expect(() =>
      parseOtaviaYaml(`
name: x
cloud: { provider: aws, region: us-east-1 }
variables:
  a: !Param X
cells:
  h: "@a/b"
`)
    ).toThrow(/!Param/);
  });

  test("rejects !Env outside variables", () => {
    expect(() =>
      parseOtaviaYaml(`
name: !Env NAME
cloud: { provider: aws, region: us-east-1 }
variables: {}
cells:
  h: "@a/b"
`)
    ).toThrow(/!Env/);
  });

  test("allows !Env !Secret !Var under variables", () => {
    const r = parseOtaviaYaml(`
name: x
cloud: { provider: aws, region: us-east-1 }
variables:
  a: !Env FOO
  b: !Secret BAR
  c: !Var a
cells:
  h: "@a/b"
`);
    expect(r.variables?.a).toMatchObject({ kind: "env", key: "FOO" });
    expect(isVarRef(r.variables?.c)).toBe(true);
  });

  test("allows !Var under cells[].params", () => {
    const r = parseOtaviaYaml(`
name: x
cloud: { provider: aws, region: us-east-1 }
variables:
  token: !Env T
cells:
  h:
    package: "@a/b"
    params:
      x: !Var token
`);
    const params = r.cellsList[0]?.params;
    expect(params?.x).toMatchObject({ kind: "var", key: "token" });
  });

  test("rejects !Secret under cells params", () => {
    expect(() =>
      parseOtaviaYaml(`
name: x
cloud: { provider: aws, region: us-east-1 }
variables: {}
cells:
  h:
    package: "@a/b"
    params:
      x: !Secret S
`)
    ).toThrow(/!Env and !Secret/);
  });

  test("rejects aws cloud with location set", () => {
    expect(() =>
      parseOtaviaYaml(`
name: x
cloud:
  provider: aws
  region: us-east-1
  location: eastus
variables: {}
cells:
  h: "@a/b"
`)
    ).toThrow(/must not set "location"/);
  });

  test("rejects unknown cloud.provider", () => {
    expect(() =>
      parseOtaviaYaml(`
name: x
cloud:
  provider: gcp
  region: x
variables: {}
cells:
  h: "@a/b"
`)
    ).toThrow(/cloud\.provider must be "aws"/);
  });

  test("parses top-level deploy params", () => {
    const r = parseOtaviaYaml(`
name: demo
cloud: { provider: aws, region: us-east-1 }
cells:
  hello: "@acme/hello"
deploy:
  timeout: 30
  memory: 512
  runtime: bun
`);
    expect(r.deploy).toEqual({ timeout: 30, memory: 512, runtime: "bun" });
    expect(r.warnings).toEqual([]);
  });

  test("deploy is undefined when omitted", () => {
    const r = parseOtaviaYaml(MINIMAL);
    expect(r.deploy).toBeUndefined();
  });

  test("rejects non-object deploy", () => {
    expect(() =>
      parseOtaviaYaml(`
name: x
cloud: { provider: aws, region: us-east-1 }
cells:
  h: "@a/b"
deploy: 42
`)
    ).toThrow(/must be an object/);
  });

  test("rejects non-number deploy.timeout", () => {
    expect(() =>
      parseOtaviaYaml(`
name: x
cloud: { provider: aws, region: us-east-1 }
cells:
  h: "@a/b"
deploy:
  timeout: fast
`)
    ).toThrow(/timeout must be a number/);
  });

  test("rejects non-number deploy.memory", () => {
    expect(() =>
      parseOtaviaYaml(`
name: x
cloud: { provider: aws, region: us-east-1 }
cells:
  h: "@a/b"
deploy:
  memory: big
`)
    ).toThrow(/memory must be a number/);
  });

  test("rejects non-string deploy.runtime", () => {
    expect(() =>
      parseOtaviaYaml(`
name: x
cloud: { provider: aws, region: us-east-1 }
cells:
  h: "@a/b"
deploy:
  runtime: 123
`)
    ).toThrow(/runtime must be a string/);
  });

  test("cells Record format with string values", () => {
    const r = parseOtaviaYaml(`
name: x
cloud: { provider: aws, region: us-east-1 }
cells:
  api: "@acme/api"
  web: "@acme/web"
`);
    expect(r.cells).toEqual({ api: "@acme/api", web: "@acme/web" });
    expect(r.cellsList).toEqual([
      { mount: "api", package: "@acme/api" },
      { mount: "web", package: "@acme/web" },
    ]);
  });

  test("cells Record format with object values and deploy", () => {
    const r = parseOtaviaYaml(`
name: x
cloud: { provider: aws, region: us-east-1 }
cells:
  api:
    package: "@acme/api"
    params:
      port: 3000
    deploy:
      timeout: 60
      memory: 1024
`);
    expect(r.cells).toEqual({ api: "@acme/api" });
    expect(r.cellsList).toEqual([
      { mount: "api", package: "@acme/api", params: { port: 3000 }, deploy: { timeout: 60, memory: 1024 } },
    ]);
    expect(r.cellOverrides).toEqual({ api: { timeout: 60, memory: 1024 } });
  });

  test("cells Record format mixed string and object entries", () => {
    const r = parseOtaviaYaml(`
name: x
cloud: { provider: aws, region: us-east-1 }
cells:
  api:
    package: "@acme/api"
    deploy:
      runtime: bun
  web: "@acme/web"
`);
    expect(r.cells).toEqual({ api: "@acme/api", web: "@acme/web" });
    expect(r.cellsList).toHaveLength(2);
    expect(r.cellsList[0]?.deploy).toEqual({ runtime: "bun" });
    expect(r.cellsList[1]?.deploy).toBeUndefined();
    expect(r.cellOverrides).toEqual({ api: { runtime: "bun" } });
  });

  test("cellOverrides absent when no cell has deploy", () => {
    const r = parseOtaviaYaml(MINIMAL);
    expect(r.cellOverrides).toBeUndefined();
  });

  // ── DP-11 ~ DP-16 acceptance tests ──────────────────────────────

  test("DP-11: deploy replaces defaults — top-level deploy parses correctly", () => {
    const r = parseOtaviaYaml(`
name: casfa
cloud: { provider: aws, region: us-east-1 }
cells:
  hello: "@acme/hello"
deploy:
  timeout: 30
  memory: 512
  runtime: nodejs20.x
`);
    expect(r.deploy).toEqual({ timeout: 30, memory: 512, runtime: "nodejs20.x" });
    expect(r.warnings).toEqual([]);
  });

  test("DP-12: defaults is rejected — produces unknown key warning", () => {
    const r = parseOtaviaYaml(`
name: casfa
cloud: { provider: aws, region: us-east-1 }
cells:
  hello: "@acme/hello"
defaults:
  timeout: 30
`);
    expect(r.warnings.some((w) => w.includes("defaults"))).toBe(true);
    expect(r.deploy).toBeUndefined();
  });

  test("DP-13: cells Record format — object and string values parse as Record", () => {
    const r = parseOtaviaYaml(`
name: casfa
cloud: { provider: aws, region: us-east-1 }
cells:
  sso:
    package: "@casfa/sso"
  drive: "@casfa/drive"
`);
    expect(r.cells).toEqual({ sso: "@casfa/sso", drive: "@casfa/drive" });
    expect(r.cellsList).toEqual([
      { mount: "sso", package: "@casfa/sso" },
      { mount: "drive", package: "@casfa/drive" },
    ]);
    expect(r.warnings).toEqual([]);
  });

  test("DP-14: cells array format backward compat — array still parses", () => {
    const r = parseOtaviaYaml(`
name: casfa
cloud: { provider: aws, region: us-east-1 }
cells:
  - package: "@casfa/sso"
    mount: sso
  - package: "@casfa/drive"
    mount: drive
`);
    expect(r.cells).toEqual({ sso: "@casfa/sso", drive: "@casfa/drive" });
    expect(r.cellsList).toHaveLength(2);
    expect(r.cellsList[0]).toMatchObject({ mount: "sso", package: "@casfa/sso" });
    expect(r.cellsList[1]).toMatchObject({ mount: "drive", package: "@casfa/drive" });
  });

  test("DP-15: per-cell deploy explicit — deploy extracted from cell object", () => {
    const r = parseOtaviaYaml(`
name: casfa
cloud: { provider: aws, region: us-east-1 }
cells:
  drive:
    package: "@casfa/drive"
    deploy:
      memory: 1024
`);
    expect(r.cellsList[0]?.deploy).toEqual({ memory: 1024 });
    expect(r.cellOverrides).toEqual({ drive: { memory: 1024 } });
  });

  test("DP-16: DeployParams accepts runtime — runtime stored without error", () => {
    const r = parseOtaviaYaml(`
name: casfa
cloud: { provider: aws, region: us-east-1 }
cells:
  api:
    package: "@casfa/api"
    deploy:
      runtime: nodejs20.x
      memory: 256
deploy:
  runtime: nodejs20.x
`);
    expect(r.deploy).toEqual({ runtime: "nodejs20.x" });
    expect(r.cellsList[0]?.deploy).toEqual({ runtime: "nodejs20.x", memory: 256 });
    expect(r.cellOverrides).toEqual({ api: { runtime: "nodejs20.x", memory: 256 } });
    expect(r.warnings).toEqual([]);
  });

  test("cells array format with deploy", () => {
    const r = parseOtaviaYaml(`
name: x
cloud: { provider: aws, region: us-east-1 }
cells:
  - package: "@acme/api"
    mount: api
    deploy:
      timeout: 10
`);
    expect(r.cells).toEqual({ api: "@acme/api" });
    expect(r.cellsList[0]?.deploy).toEqual({ timeout: 10 });
    expect(r.cellOverrides).toEqual({ api: { timeout: 10 } });
  });

  test("cells array format string shorthand", () => {
    const r = parseOtaviaYaml(`
name: x
cloud: { provider: aws, region: us-east-1 }
cells:
  - hello
`);
    expect(r.cells).toEqual({ hello: "@otavia/hello" });
    expect(r.cellsList).toEqual([{ mount: "hello", package: "@otavia/hello" }]);
  });

  test("rejects non-object cell deploy", () => {
    expect(() =>
      parseOtaviaYaml(`
name: x
cloud: { provider: aws, region: us-east-1 }
cells:
  api:
    package: "@a/b"
    deploy: 99
`)
    ).toThrow(/deploy must be an object/);
  });

  test("rejects empty cells object", () => {
    expect(() =>
      parseOtaviaYaml(`
name: x
cloud: { provider: aws, region: us-east-1 }
cells: {}
`)
    ).toThrow(/at least one entry/);
  });

  test("rejects empty cells array", () => {
    expect(() =>
      parseOtaviaYaml(`
name: x
cloud: { provider: aws, region: us-east-1 }
cells: []
`)
    ).toThrow(/non-empty/);
  });
});

describe("providerKind", () => {
  test("returns discriminator", () => {
    expect(providerKind({ provider: "aws", region: "us-east-1" })).toBe("aws");
  });
});
