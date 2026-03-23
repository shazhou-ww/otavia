import { describe, expect, test } from "bun:test";
import { OtaviaCredentialUserError } from "./otavia-credential-user-error.js";

describe("OtaviaCredentialUserError", () => {
  test("is instanceof Error with stable name", () => {
    const e = new OtaviaCredentialUserError("Run:\n\n  az login\n");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("OtaviaCredentialUserError");
    expect(e.message).toContain("az login");
  });
});
