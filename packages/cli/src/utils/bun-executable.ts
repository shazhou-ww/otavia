/** Prefer the running Bun binary so subprocesses work when `bun` is not on PATH. */
export function bunExecutable(): string {
  return process.execPath;
}
