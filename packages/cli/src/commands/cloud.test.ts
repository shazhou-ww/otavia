import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCloudLogin } from "./cloud.js";

describe("runCloudLogin", () => {
  test("returns 1 outside workspace", async () => {
    const dir = await mkdtemp(join(tmpdir(), "otavia-cloud-"));
    try {
      expect(runCloudLogin(dir)).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
