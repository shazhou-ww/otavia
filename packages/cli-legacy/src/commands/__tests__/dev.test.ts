import { describe, expect, test } from "bun:test";
import { resolveDevPublicBaseUrl, resolveDevTunnelEnabled, type DevTunnelIntent } from "../dev";

describe("resolveDevPublicBaseUrl", () => {
  test("uses tunnel public base URL when tunnel is enabled", () => {
    expect(
      resolveDevPublicBaseUrl({
        tunnelEnabled: true,
        tunnelPublicBaseUrl: "https://mybox.dev.example.com",
        gatewayOnly: false,
        vitePort: 7100,
      })
    ).toBe("https://mybox.dev.example.com");
  });

  test("uses localhost vite base URL in normal local dev", () => {
    expect(
      resolveDevPublicBaseUrl({
        tunnelEnabled: false,
        gatewayOnly: false,
        vitePort: 7100,
      })
    ).toBe("http://localhost:7100");
  });

  test("returns undefined in gateway-only mode", () => {
    expect(
      resolveDevPublicBaseUrl({
        tunnelEnabled: false,
        gatewayOnly: true,
        vitePort: 7100,
      })
    ).toBeUndefined();
  });
});

describe("resolveDevTunnelEnabled", () => {
  test("off intent disables tunnel", () => {
    expect(resolveDevTunnelEnabled({ mode: "off" } satisfies DevTunnelIntent)).toBe(false);
  });

  test("on intent enables tunnel", () => {
    expect(resolveDevTunnelEnabled({ mode: "on" } satisfies DevTunnelIntent)).toBe(true);
  });
});
