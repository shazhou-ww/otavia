/**
 * Profile names from the contents of an AWS shared `config` file (`~/.aws/config`).
 * See https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html
 */
export function parseAwsConfigProfiles(configFileContent: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of configFileContent.split(/\r?\n/)) {
    const m = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (!m) continue;
    const header = m[1].trim();
    if (header === "default") {
      if (!seen.has("default")) {
        seen.add("default");
        out.push("default");
      }
      continue;
    }
    const profilePrefix = "profile ";
    if (header.startsWith(profilePrefix)) {
      const name = header.slice(profilePrefix.length).trim();
      if (name !== "" && !seen.has(name)) {
        seen.add(name);
        out.push(name);
      }
    }
  }
  return out;
}
