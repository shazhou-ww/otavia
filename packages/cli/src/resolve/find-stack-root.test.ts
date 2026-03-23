import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { findStackRoot } from "./find-stack-root.js";

describe("findStackRoot", () => {
  test("finds stacks/main from nested cwd", () => {
    const root = mkdtempSync(join(tmpdir(), "otavia-stack-"));
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "mono", private: true, workspaces: ["stacks/*", "cells/*"] }),
      "utf-8"
    );
    const stackDir = join(root, "stacks", "main");
    mkdirSync(join(stackDir, "src"), { recursive: true });
    writeFileSync(join(stackDir, "otavia.yaml"), "name: main\n", "utf-8");

    expect(findStackRoot(join(stackDir, "src"))).toBe(stackDir);
  });

  test("returns null when otavia.yaml not on path to workspace root", () => {
    const root = mkdtempSync(join(tmpdir(), "otavia-stack-"));
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "mono", private: true, workspaces: ["packages/*"] }),
      "utf-8"
    );
    mkdirSync(join(root, "packages", "foo"), { recursive: true });

    expect(findStackRoot(join(root, "packages", "foo"))).toBeNull();
  });

  test("finds workspace root when otavia.yaml is at root", () => {
    const root = mkdtempSync(join(tmpdir(), "otavia-stack-"));
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "mono", private: true, workspaces: ["*"] }),
      "utf-8"
    );
    writeFileSync(join(root, "otavia.yaml"), "name: root\n", "utf-8");
    mkdirSync(join(root, "other"), { recursive: true });

    expect(findStackRoot(join(root, "other"))).toBe(root);
  });

  test("returns null when outside any workspace", () => {
    const orphan = mkdtempSync(join(tmpdir(), "orphan-"));
    mkdirSync(join(orphan, "a"), { recursive: true });
    writeFileSync(join(orphan, "a", "otavia.yaml"), "x: y\n", "utf-8");

    expect(findStackRoot(join(orphan, "a"))).toBeNull();
  });
});
