import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { findWorkspaceRoot } from "./find-workspace-root.js";

function scaffoldRepo(layout: (root: string) => void): string {
  const root = mkdtempSync(join(tmpdir(), "otavia-ws-"));
  layout(root);
  return root;
}

describe("findWorkspaceRoot", () => {
  test("finds root when package.json has workspaces array", () => {
    const root = scaffoldRepo((r) => {
      writeFileSync(
        join(r, "package.json"),
        JSON.stringify({ name: "x", private: true, workspaces: ["packages/*"] }),
        "utf-8"
      );
      mkdirSync(join(r, "deep", "nested"), { recursive: true });
    });
    expect(findWorkspaceRoot(join(root, "deep", "nested"))).toBe(root);
  });

  test("finds root when workspaces is { packages: [...] }", () => {
    const root = scaffoldRepo((r) => {
      writeFileSync(
        join(r, "package.json"),
        JSON.stringify({
          name: "x",
          private: true,
          workspaces: { packages: ["packages/*"] },
        }),
        "utf-8"
      );
    });
    expect(findWorkspaceRoot(root)).toBe(root);
  });

  test("returns null when no workspaces field", () => {
    const root = scaffoldRepo((r) => {
      writeFileSync(join(r, "package.json"), JSON.stringify({ name: "x" }), "utf-8");
    });
    expect(findWorkspaceRoot(root)).toBeNull();
  });

  test("returns null when workspaces array empty", () => {
    const root = scaffoldRepo((r) => {
      writeFileSync(
        join(r, "package.json"),
        JSON.stringify({ name: "x", workspaces: [] }),
        "utf-8"
      );
    });
    expect(findWorkspaceRoot(root)).toBeNull();
  });
});
