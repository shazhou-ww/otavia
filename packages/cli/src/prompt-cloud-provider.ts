import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

/**
 * Prompt until the user enters `aws` or `azure` (for non-TTY stdin, this may hang — callers should pass `--provider` in CI).
 */
export async function promptCloudProvider(): Promise<"aws" | "azure"> {
  const rl = createInterface({ input, output });
  try {
    for (;;) {
      const line = (await rl.question('Cloud provider (aws / azure): ')).trim().toLowerCase();
      if (line === "aws" || line === "azure") return line;
      output.write('Please type "aws" or "azure".\n');
    }
  } finally {
    rl.close();
  }
}
