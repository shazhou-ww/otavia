import { describe, expect, test } from "bun:test";
import { createHostAdapterForCloud } from "./create-host-adapter.js";

describe("createHostAdapterForCloud", () => {
  test("returns AWS host for aws cloud", () => {
    const h = createHostAdapterForCloud({ provider: "aws", region: "us-east-1" });
    expect(h.providerId).toBe("aws");
  });

  test("returns Azure host for azure cloud", () => {
    const h = createHostAdapterForCloud({ provider: "azure", location: "eastus" });
    expect(h.providerId).toBe("azure");
  });
});
