import { describe, expect, test } from "bun:test";
import { parseYamlWithOtaviaTags } from "./load-yaml.js";
import { isEnvRef, isParamRef, isSecretRef, isVarRef } from "./tags.js";

describe("parseYamlWithOtaviaTags", () => {
  test("resolves !Env !Secret !Var !Param to tagged objects", () => {
    const doc = parseYamlWithOtaviaTags(`
variables:
  a: !Env FOO
  b: !Secret BAR
  c: !Var a
  d: !Param P
`) as { variables: Record<string, unknown> };

    const { variables } = doc;
    expect(isEnvRef(variables.a) && variables.a.key).toBe("FOO");
    expect(isSecretRef(variables.b) && variables.b.key).toBe("BAR");
    expect(isVarRef(variables.c) && variables.c.key).toBe("a");
    expect(isParamRef(variables.d) && variables.d.key).toBe("P");
  });

  test("throws on invalid YAML", () => {
    expect(() => parseYamlWithOtaviaTags("variables: [\n")).toThrow();
  });
});
