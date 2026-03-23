import { spawn } from "node:child_process";

export type CommandRunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type CommandRunner = (executable: string, args: string[]) => Promise<CommandRunResult>;

export function defaultAzureRunner(executable: string, args: string[]): Promise<CommandRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}
