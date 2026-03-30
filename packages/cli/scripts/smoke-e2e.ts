/**
 * E2E smoke test: init → install → dev gateway flow.
 * Tests the complete workflow without Vite (gateway-only mode).
 * Run from packages/cli: bun run scripts/smoke-e2e.ts
 */
import { mkdtempSync, rmSync, statSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { runInit } from "../src/commands/init.js";

/** packages/cli directory */
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** Otavia git repo root */
const repoRoot = resolve(packageRoot, "..", "..");

function logSection(title: string): void {
  console.log(`\n--- ${title} ---`);
}

function checkFileExists(path: string, description: string): void {
  if (!existsSync(path)) {
    throw new Error(`Missing required file: ${description} at ${path}`);
  }
  console.log(`✓ ${description} exists`);
}

function checkDirectory(path: string, description: string): void {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    throw new Error(`Missing required directory: ${description} at ${path}`);
  }
  console.log(`✓ ${description} directory exists`);
}

async function pollEndpoint(url: string, timeoutMs: number): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  let lastError: Error | null = null;
  
  while (Date.now() < deadline) {
    try {
      console.log(`Polling ${url}...`);
      const response = await fetch(url);
      if (response.ok) {
        const json = await response.json();
        if (json && typeof json === 'object' && 'message' in json) {
          console.log(`✓ Gateway responding with:`, json);
          return json;
        } else {
          throw new Error(`Invalid response format: missing 'message' field`);
        }
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await Bun.sleep(2000); // Wait 2 seconds between retries
    }
  }
  
  throw new Error(`Endpoint poll timeout after ${timeoutMs}ms. Last error: ${lastError?.message}`);
}

async function main(): Promise<void> {
  // Step 1: Build CLI
  logSection("Step 1: Build CLI");
  console.log("Building CLI JS to ensure dist/ is up to date...");
  const buildResult = Bun.spawnSync(["bun", "run", "build:js"], {
    cwd: packageRoot,
    stderr: "inherit",
    stdout: "inherit",
  });
  if (buildResult.exitCode !== 0) {
    throw new Error(`CLI build failed with exit code ${buildResult.exitCode}`);
  }
  console.log("✓ CLI built successfully");

  // Create temporary directory
  const tmpDir = mkdtempSync(join(tmpdir(), "otavia-smoke-e2e-"));
  console.log(`Using temp directory: ${tmpDir}`);

  // Random port to avoid conflicts
  const backendPort = 9000 + Math.floor(Math.random() * 1000);
  console.log(`Using backend port: ${backendPort}`);

  let devProcess: any = null;

  try {
    // Step 2: Init
    logSection("Step 2: Init");
    console.log(`Initializing project in ${tmpDir}...`);
    await runInit(tmpDir, { 
      region: 'us-east-1', 
      useGlobalOtavia: true 
    });
    console.log("✓ runInit completed");

    // Verify scaffold structure
    checkFileExists(join(tmpDir, "cells/hello/cell.yaml"), "cells/hello/cell.yaml");
    checkFileExists(join(tmpDir, "cells/hello/backend/app.ts"), "cells/hello/backend/app.ts");
    checkFileExists(join(tmpDir, "stacks/main/otavia.yaml"), "stacks/main/otavia.yaml");
    checkFileExists(join(tmpDir, "stacks/main/package.json"), "stacks/main/package.json");
    checkFileExists(join(tmpDir, "package.json"), "package.json");
    console.log("✓ All required files created");

    // Step 3: Install
    logSection("Step 3: Install");
    console.log("Running bun install --no-cache...");
    const installResult = Bun.spawnSync(["bun", "install", "--no-cache"], {
      cwd: tmpDir,
      stderr: "inherit", 
      stdout: "inherit",
    });
    if (installResult.exitCode !== 0) {
      throw new Error(`bun install failed with exit code ${installResult.exitCode}`);
    }

    // Verify node_modules exists
    checkDirectory(join(tmpDir, "node_modules"), "node_modules");
    console.log("✓ Dependencies installed successfully");

    // Step 4: Dev (gateway only mode)
    logSection("Step 4: Dev (gateway only mode)");
    
    const stackMainDir = join(tmpDir, "stacks/main");
    const cliPath = join(packageRoot, "src/cli.ts");
    
    console.log(`Starting dev process from ${stackMainDir}...`);
    console.log(`CLI path: ${cliPath}`);
    console.log(`Backend port: ${backendPort}`);

    // Start the dev process
    devProcess = Bun.spawn(["bun", "run", cliPath, "dev"], {
      cwd: stackMainDir,
      env: {
        ...process.env,
        OTAVIA_DEV_GATEWAY_ONLY: "1",
        OTAVIA_BACKEND_PORT: String(backendPort),
        OTAVIA_SKIP_AWS_CHECK: "1",
      },
      stdout: "inherit",
      stderr: "inherit",
    });
    
    console.log("✓ Dev process started");

    // Poll the endpoint
    const endpointUrl = `http://127.0.0.1:${backendPort}/hello/api/hello`;
    console.log(`Polling endpoint: ${endpointUrl}`);
    
    await pollEndpoint(endpointUrl, 60000); // 60 second timeout
    console.log("✓ Gateway responding successfully");

    // Clean kill the process
    console.log("Terminating dev process...");
    devProcess.kill("SIGTERM");
    await devProcess.exited;
    console.log("✓ Dev process terminated cleanly");
    devProcess = null;

    // Step 5: Cleanup and result
    logSection("Step 5: Cleanup");
    console.log(`Removing temp directory: ${tmpDir}`);
    rmSync(tmpDir, { recursive: true, force: true });
    console.log("✓ Temp directory removed");

    logSection("RESULT: PASS");
    console.log("🎉 All tests passed! The e2e smoke test completed successfully.");
    console.log("✅ init → install → dev workflow is working correctly");

  } catch (error) {
    // Make sure to kill the dev process if it's still running
    if (devProcess) {
      try {
        console.log("Killing dev process due to error...");
        devProcess.kill("SIGKILL");
        await devProcess.exited;
      } catch (killError) {
        console.log("Failed to kill dev process:", killError);
      }
    }

    // Clean up temp directory
    try {
      console.log(`Cleaning up temp directory: ${tmpDir}`);
      rmSync(tmpDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.log("Failed to cleanup temp directory:", cleanupError);
    }

    logSection("RESULT: FAIL");
    console.error("❌ E2E smoke test failed:");
    console.error(error instanceof Error ? error.message : error);
    throw error;
  }
}

// Run the test
main().catch((error) => {
  console.error("Fatal error in smoke test:", error);
  process.exit(1);
});