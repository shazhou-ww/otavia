// Optional: depend on `@otavia/runtime-aws` or `@otavia/runtime-azure` and call `platform()`.
// import type { CloudPlatform } from "@otavia/runtime-contract";
// import { platform } from "@otavia/runtime-aws";

export function handler(): { statusCode: number; body: string } {
  return { statusCode: 200, body: "ok" };
}
