import { describe, expect, test } from "bun:test";
import { loadTemplate, renderTemplate } from "../load";

describe("renderTemplate", () => {
  test("replaces placeholders", () => {
    expect(renderTemplate("a {{x}} b", { x: "1" })).toBe("a 1 b");
  });

  test("throws on missing key", () => {
    expect(() => renderTemplate("{{missing}}", {})).toThrow(/Missing template variable/);
  });
});

describe("loadTemplate", () => {
  test("reads init packages readme from assets", () => {
    const s = loadTemplate("init/packages-readme.md");
    expect(s).toContain("packages/");
    expect(s).toContain("Bun");
  });

  test("reads dev main-frontend index", () => {
    expect(loadTemplate("dev-main-frontend/index.html")).toContain("Otavia Main");
  });

  test("reads setup cloudflared template", () => {
    expect(loadTemplate("setup/cloudflared-config.yaml.tmpl")).toContain("{{tunnelName}}");
  });

  test("reads init gitignore lines", () => {
    expect(loadTemplate("init/gitignore-lines.txt")).toContain("apps/main/.env");
  });
});
