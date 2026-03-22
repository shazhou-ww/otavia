import { describe, expect, test } from "bun:test";
import { publicOriginDiffersFromLocalVite } from "../vite-dev";

describe("publicOriginDiffersFromLocalVite", () => {
  test("false when URL matches loopback and vite port", () => {
    expect(publicOriginDiffersFromLocalVite("http://localhost:7100", 7100)).toBe(false);
    expect(publicOriginDiffersFromLocalVite("http://127.0.0.1:7100", 7100)).toBe(false);
  });

  test("true for https tunnel host", () => {
    expect(publicOriginDiffersFromLocalVite("https://mymbp.example.com", 7100)).toBe(true);
  });

  test("true when loopback port differs from vite port", () => {
    expect(publicOriginDiffersFromLocalVite("http://localhost:8900", 7100)).toBe(true);
  });
});
