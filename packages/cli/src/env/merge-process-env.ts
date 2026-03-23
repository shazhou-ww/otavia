/**
 * `process.env` first, then override with values from loaded dotenv files.
 */
export function mergeProcessAndFileEnv(fileEnv: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v;
  }
  Object.assign(env, fileEnv);
  return env;
}
