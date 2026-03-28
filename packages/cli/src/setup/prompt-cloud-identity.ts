import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { join } from "node:path";
import { upsertDotenvKey } from "../env/upsert-dotenv-key.js";
import { listAwsProfileNames } from "./list-aws-profiles.js";

function shouldSkipCloudIdentityPrompt(): boolean {
  return process.env.OTAVIA_SETUP_SKIP_CLOUD_IDENTITY === "1";
}

async function promptLine(question: string): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

/**
 * Interactive: pick AWS profile and write to **stack** `.env`.
 * No-op when stdin is not a TTY or `OTAVIA_SETUP_SKIP_CLOUD_IDENTITY=1`.
 */
export async function promptAndWriteCloudIdentity(stackRoot: string): Promise<void> {
  if (!input.isTTY || shouldSkipCloudIdentityPrompt()) return;

  const envPath = join(stackRoot, ".env");

  // Only AWS is supported
  const profiles = await listAwsProfileNames();
  output.write("AWS profile (saved as AWS_PROFILE in .env)\n");
  if (profiles.length > 0) {
    profiles.forEach((p, i) => {
      output.write(`  ${i + 1}) ${p}\n`);
    });
    output.write("  0) Skip\n");
  } else {
    output.write("  (No profiles found in ~/.aws/config — you can type a profile name.)\n");
  }
  const hint = profiles.length > 0 ? `Choice [0-${profiles.length}] or profile name: ` : "Profile name (empty to skip): ";
  const raw = await promptLine(hint);
  if (raw === "" || raw === "0") return;
  const n = Number.parseInt(raw, 10);
  let chosen: string | null = null;
  if (profiles.length > 0 && String(n) === raw && n >= 1 && n <= profiles.length) {
    chosen = profiles[n - 1] ?? null;
  } else if (raw !== "0") {
    chosen = raw;
  }
  if (chosen === null || chosen === "") return;
  await upsertDotenvKey(envPath, "AWS_PROFILE", chosen);
  output.write(`[otavia] Wrote AWS_PROFILE=${chosen} to .env\n`);
}
