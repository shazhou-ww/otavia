/**
 * Path to the running Bun binary. Prefer this over spawning `"bun"` so subprocesses work when
 * `bun` is not on PATH (e.g. otavia started via a wrapper or GUI).
 */
export function bunExecutable(): string {
  return process.execPath;
}
