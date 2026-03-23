import { describe, expect, test } from "bun:test";
import { handler } from "../../handler.js";

describe("hello handler (unit)", () => {
  test("returns ok payload", () => {
    const r = handler();
    expect(r.statusCode).toBe(200);
    expect(r.body).toBe("ok");
  });
});
