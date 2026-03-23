import { describe, expect, test } from "bun:test";
import { createHostAdapterForProvider } from "./create-host-adapter.js";

describe("createHostAdapterForProvider", () => {
  test("returns AWS host when region is set", () => {
    const h = createHostAdapterForProvider({ region: "us-east-1" });
    expect(h.providerId).toBe("aws");
  });

  test("returns Azure host when location is set", () => {
    const h = createHostAdapterForProvider({ location: "eastus" });
    expect(h.providerId).toBe("azure");
  });

  test("rejects both region and location", () => {
    expect(() =>
      createHostAdapterForProvider({ region: "us-east-1", location: "eastus" })
    ).toThrow();
  });
});
