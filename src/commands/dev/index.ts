import { checkAwsCredentials } from "../aws-auth";
import { runGatewayDev } from "./gateway";
import { startViteDev } from "./vite-dev";
import { startTunnel } from "./tunnel";
import { resolveOtaviaWorkspacePaths } from "../../config/resolve-otavia-workspace";
import { getOtaviaPackageVersion } from "../../package-version";
import { loadEnvForCell } from "../../utils/env";
import { resolvePortsFromEnv } from "../../config/ports";

export type DevTunnelIntent =
  | { mode: "off" }
  | {
      mode: "on";
      tunnelHost?: string;
      tunnelConfig?: string;
      tunnelProtocol?: string;
    };

export type DevCommandOptions = { tunnel: DevTunnelIntent };

export function resolveDevPublicBaseUrl(options: {
  tunnelEnabled?: boolean;
  tunnelPublicBaseUrl?: string;
  gatewayOnly: boolean;
  vitePort: number;
}): string | undefined {
  if (options.tunnelEnabled) return options.tunnelPublicBaseUrl;
  if (options.gatewayOnly) return undefined;
  return `http://localhost:${options.vitePort}`;
}

export function resolveDevTunnelEnabled(tunnel: DevTunnelIntent): boolean {
  return tunnel.mode === "on";
}

function envFlagTrue(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Dev command: validate otavia.yaml, start backend gateway, then Vite dev server.
 * When OTAVIA_DEV_GATEWAY_ONLY=1 (e.g. for e2e), only run gateway with PORT and optional
 * DYNAMODB_ENDPOINT/S3_ENDPOINT overrides; do not start Vite.
 * When OTAVIA_SKIP_AWS_CHECK=1, skip STS check (local UI/gateway only; deploy still needs AWS).
 * On SIGINT/SIGTERM stops and exits.
 */
export async function devCommand(rootDir: string, options: DevCommandOptions): Promise<void> {
  console.error(
    `[otavia] CLI v${getOtaviaPackageVersion()} — path debug: OTAVIA_DEBUG_RESOLVE=1; unreleased fixes: bun link otavia from this repo`
  );
  const { monorepoRoot, configDir } = resolveOtaviaWorkspacePaths(rootDir);
  if (!envFlagTrue("OTAVIA_SKIP_AWS_CHECK")) {
    const aws = await checkAwsCredentials(configDir);
    if (!aws.ok) {
      console.error(
        `AWS credentials are invalid or expired for profile "${aws.profile}".`
      );
      console.error("Run: bun run otavia aws login");
      console.error("(Local-only: OTAVIA_SKIP_AWS_CHECK=1 skips this check.)");
      process.exit(1);
    }
  } else {
    console.warn("[otavia] OTAVIA_SKIP_AWS_CHECK: skipping AWS STS check (not for production deploy).");
  }
  const stageEnv = loadEnvForCell(configDir, configDir, { stage: "dev" });
  const ports = resolvePortsFromEnv("dev", { ...stageEnv, ...process.env });
  const backendPort = ports.backend;
  const vitePort = ports.frontend;
  const gatewayOnly = process.env.OTAVIA_DEV_GATEWAY_ONLY === "1";
  const overrides: { dynamoEndpoint?: string; s3Endpoint?: string } | undefined = gatewayOnly
    ? (process.env.DYNAMODB_ENDPOINT || process.env.S3_ENDPOINT
        ? {
            dynamoEndpoint: process.env.DYNAMODB_ENDPOINT,
            s3Endpoint: process.env.S3_ENDPOINT,
          }
        : undefined)
    : undefined;

  let tunnelHandle: { publicBaseUrl: string; stop: () => void } | undefined;
  let publicBaseUrl: string | undefined;
  const tunnelEnabled = resolveDevTunnelEnabled(options.tunnel);
  if (options.tunnel.mode === "on") {
    tunnelHandle = await startTunnel(monorepoRoot, configDir, {
      tunnelConfigPath: options.tunnel.tunnelConfig,
      tunnelHost: options.tunnel.tunnelHost,
      tunnelProtocol: options.tunnel.tunnelProtocol,
    });
    publicBaseUrl = tunnelHandle.publicBaseUrl;
    console.log(`[tunnel] Started. Public base URL: ${publicBaseUrl}`);
  }

  const effectivePublicBaseUrl = resolveDevPublicBaseUrl({
    tunnelEnabled,
    tunnelPublicBaseUrl: publicBaseUrl,
    gatewayOnly,
    vitePort,
  });
  const server = await runGatewayDev(monorepoRoot, configDir, backendPort, overrides, {
    publicBaseUrl: effectivePublicBaseUrl,
    dynamodbPort: ports.dynamodb,
    minioPort: ports.minio,
  });

  if (gatewayOnly) {
    process.on("SIGINT", () => {
      tunnelHandle?.stop();
      server.stop();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      tunnelHandle?.stop();
      server.stop();
      process.exit(0);
    });
    await new Promise(() => {});
  }

  const viteHandle = await startViteDev(monorepoRoot, configDir, backendPort, vitePort, effectivePublicBaseUrl);

  const cleanup = () => {
    tunnelHandle?.stop();
    server.stop();
    viteHandle.stop();
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  await new Promise(() => {});
}
