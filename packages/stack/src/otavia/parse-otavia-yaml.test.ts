import { describe, expect, test } from "bun:test";
import { parseOtaviaYaml, providerKind } from "./parse-otavia-yaml.js";
import { isVarRef } from "../yaml/tags.js";

const MINIMAL = `
name: demo
provider:
  region: us-east-1
variables: {}
cells:
  hello: "@acme/hello"
`;

describe("parseOtaviaYaml", () => {
  test("parses minimal valid document", () => {
    const r = parseOtaviaYaml(MINIMAL);
    expect(r.name).toBe("demo");
    expect(r.cells.hello).toBe("@acme/hello");
    expect(r.cellsList).toEqual([{ mount: "hello", package: "@acme/hello" }]);
    expect(r.warnings).toEqual([]);
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
provider: { region: us-east-1 }
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
provider: { region: us-east-1 }
variables: {}
cells:
  h: "@a/b"
`)
    ).toThrow(/!Env/);
  });

  test("allows !Env !Secret !Var under variables", () => {
    const r = parseOtaviaYaml(`
name: x
provider: { region: us-east-1 }
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
provider: { region: us-east-1 }
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
provider: { region: us-east-1 }
variables: {}
cells:
  h:
    package: "@a/b"
    params:
      x: !Secret S
`)
    ).toThrow(/!Env and !Secret/);
  });

  test("accepts Azure location-only provider", () => {
    const r = parseOtaviaYaml(`
name: x
provider:
  location: eastus
variables: {}
cells:
  h: "@a/b"
`);
    expect(providerKind(r.provider)).toBe("azure");
  });

  test("rejects both region and location", () => {
    expect(() =>
      parseOtaviaYaml(`
name: x
provider:
  region: us-east-1
  location: eastus
variables: {}
cells:
  h: "@a/b"
`)
    ).toThrow(/both/);
  });
});

describe("providerKind", () => {
  test("throws when neither region nor location", () => {
    expect(() => providerKind({})).toThrow();
  });
});
