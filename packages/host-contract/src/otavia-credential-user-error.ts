/**
 * Credential check failed for a cloud host. The CLI prints {@link message} and exits without a stack trace.
 */
export class OtaviaCredentialUserError extends Error {
  override readonly name = "OtaviaCredentialUserError";

  constructor(message: string) {
    super(message);
  }
}
