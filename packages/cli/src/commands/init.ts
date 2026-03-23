import { existsSync } from "node:fs";
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const commandsDir = dirname(fileURLToPath(import.meta.url));
const templateRoot = join(commandsDir, "../../assets/templates/init");

/**
 * Use the scoped package name `@otavia/cli` (see `packages/cli/package.json` `"name"`).
 * `bunx otavia` would resolve a different npm package named `otavia`, not this CLI.
 */
const BUNX_CLI = "bunx @otavia/cli";

/**
 * Default: `bunx @otavia/cli` matches npm package name (not `bunx otavia`).
 * `--use-global-otavia`: omit devDependency on `@otavia/cli` (unpublished-safe `bun install`); scripts use `otavia` on PATH (`bun link --global` / global install).
 */
function stackPackageScripts(useGlobalOtavia: boolean): Record<string, string> {
  const x = useGlobalOtavia ? "otavia" : BUNX_CLI;
  return {
    dev: `${x} dev`,
    setup: `${x} setup`,
    deploy: `${x} deploy`,
    cloud: `${x} cloud login`,
    "cloud:login": `${x} cloud login`,
    "cloud:logout": `${x} cloud logout`,
    test: "bun test test/unit test/e2e",
    "test:all": `${x} test`,
    lint: `${x} lint`,
    typecheck: "tsc --noEmit",
  };
}

async function writeStackPackageJson(stackMain: string, useGlobalOtavia: boolean): Promise<void> {
  const stackPkgPath = join(stackMain, "package.json");
  const pkg = JSON.parse(await readFile(stackPkgPath, "utf8")) as {
    name?: string;
    version?: string;
    private?: boolean;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  pkg.scripts = stackPackageScripts(useGlobalOtavia);
  pkg.devDependencies = {
    "@types/bun": "^1.3.11",
    "typescript": "^5.8.3",
  };
  if (!useGlobalOtavia) {
    pkg.devDependencies["@otavia/cli"] = "0.0.1";
  }
  await writeFile(stackPkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
}

function otaviaYaml(provider: "aws" | "azure"): string {
  if (provider === "aws") {
    return `name: main
cloud:
  provider: aws
  region: us-east-1
variables: {}
cells:
  - mount: hello
    package: "@demo/hello"
`;
  }
  return `name: main
cloud:
  provider: azure
  location: eastus
variables: {}
cells:
  - mount: hello
    package: "@demo/hello"
`;
}

export async function runInit(
  targetDir: string,
  options: { provider: "aws" | "azure"; useGlobalOtavia?: boolean }
): Promise<void> {
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
  await writeStackPackageJson(stackMain, options.useGlobalOtavia === true);
}
