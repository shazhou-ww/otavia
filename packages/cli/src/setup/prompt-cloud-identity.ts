import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { join } from "node:path";
import { upsertDotenvKey } from "../env/upsert-dotenv-key.js";
import { listAwsProfileNames } from "./list-aws-profiles.js";
import { listAzureSubscriptions } from "./list-azure-subscriptions.js";

const AZ_SUB_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
 * Interactive: pick AWS profile or Azure subscription and write to **stack** `.env`.
 * No-op when stdin is not a TTY or `OTAVIA_SETUP_SKIP_CLOUD_IDENTITY=1`.
 */
export async function promptAndWriteCloudIdentity(
  stackRoot: string,
  provider: "aws" | "azure"
): Promise<void> {
  if (!input.isTTY || shouldSkipCloudIdentityPrompt()) return;

  const envPath = join(stackRoot, ".env");

  if (provider === "aws") {
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
    return;
  }

  // azure
  const subs = await listAzureSubscriptions();
  output.write("Azure subscription (saved as AZURE_SUBSCRIPTION_ID in .env)\n");
  output.write("  (Isolated CLI configs: set AZURE_CONFIG_DIR yourself if needed.)\n");
  if (subs.length > 0) {
    subs.forEach((s, i) => {
      const tag = s.isDefault ? " (default)" : "";
      output.write(`  ${i + 1}) ${s.name}${tag}\n`);
      output.write(`      ${s.id}\n`);
    });
    output.write("  0) Skip\n");
  } else {
    output.write("  (Could not list subscriptions — run `az login` first, or paste a subscription ID.)\n");
  }
  const hint =
    subs.length > 0
      ? "Choice [0-" + subs.length + "], or paste subscription ID, empty to skip: "
      : "Subscription ID (empty to skip): ";
  const raw = await promptLine(hint);
  if (raw === "" || raw === "0") return;
  const n = Number.parseInt(raw, 10);
  let chosenId: string | null = null;
  if (subs.length > 0 && String(n) === raw && n >= 1 && n <= subs.length) {
    chosenId = subs[n - 1]?.id ?? null;
  } else if (AZ_SUB_ID_RE.test(raw)) {
    chosenId = raw;
  } else if (raw !== "") {
    output.write("Not a valid subscription UUID. Skipping AZURE_SUBSCRIPTION_ID.\n");
    return;
  }
  if (chosenId === null || chosenId === "") return;
  await upsertDotenvKey(envPath, "AZURE_SUBSCRIPTION_ID", chosenId);
  output.write(`[otavia] Wrote AZURE_SUBSCRIPTION_ID to .env\n`);
}
