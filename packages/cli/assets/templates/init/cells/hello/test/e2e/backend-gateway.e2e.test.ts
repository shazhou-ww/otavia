import { describe, expect, test } from "bun:test";
import { createAppForBackend } from "../../backend/app.js";

/**
 * Exercises the same `{ fetch }` surface the dev gateway uses (in-process, no TCP).
 */
describe("hello backend (e2e)", () => {
  test("GET / returns handler body", async () => {
    const app = createAppForBackend({});
    const res = await app.fetch(new Request("http://cell.local/"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  test("unknown path 404", async () => {
    const app = createAppForBackend({});
    const res = await app.fetch(new Request("http://cell.local/api/nope"));
    expect(res.status).toBe(404);
  });
});
