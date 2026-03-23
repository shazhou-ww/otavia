import { existsSync } from "node:fs";
import { cp, mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const commandsDir = dirname(fileURLToPath(import.meta.url));
const templateRoot = join(commandsDir, "../../assets/templates/init");

function otaviaYaml(provider: "aws" | "azure"): string {
  if (provider === "aws") {
    return `name: main
provider:
  region: us-east-1
variables: {}
cells:
  - mount: hello
    package: "@demo/hello"
`;
  }
  return `name: main
provider:
  location: eastus
variables: {}
cells:
  - mount: hello
    package: "@demo/hello"
`;
}

export async function runInit(targetDir: string, options: { provider: "aws" | "azure" }): Promise<void> {
  const abs = resolve(targetDir);
  await mkdir(abs, { recursive: true });
  const entries = await readdir(abs);
  if (entries.length > 0) {
    throw new Error(`Directory is not empty; refusing to init: ${abs}`);
  }
  await cp(templateRoot, abs, { recursive: true });
  const stackMain = join(abs, "stacks", "main");
  if (!existsSync(stackMain)) {
    throw new Error(`Init template missing stacks/main under ${abs}`);
  }
  await writeFile(join(stackMain, "otavia.yaml"), otaviaYaml(options.provider), "utf8");
}
