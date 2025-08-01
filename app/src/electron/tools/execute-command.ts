/**
 * FoxyChat Agent Tools - Execute Command
 *
 * Simple command execution tool for AI agents.
 */

import { tool } from "ai";
import { exec } from "child_process";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const execAsync = (command: string, options: any) => {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    exec(command, options, (error, stdout, stderr) => {
      if (error) {
        reject(
          Object.assign(error, {
            stdout: stdout.toString(),
            stderr: stderr.toString(),
          }),
        );
      } else {
        resolve({
          stdout: stdout.toString(),
          stderr: stderr.toString(),
        });
      }
    });
  });
};

// Define execute command tool
export const executeCommand = tool({
  description: "Execute a shell command and return the output",
  parameters: z.object({
    command: z.string().describe("The shell command to execute"),
    timeout: z
      .number()
      .min(1000)
      .max(30000)
      .default(10000)
      .describe("Timeout in milliseconds (default: 10000, max: 30000)"),
  }),
  execute: async ({ command, timeout }) => {
    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout,
        maxBuffer: 1024 * 1024, // 1MB max output
      });

      return {
        success: true,
        command,
        stdout,
        stderr,
        message: `Command executed successfully:\n\nSTDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      const errorMessage = error.message || String(error);

      return {
        success: false,
        command,
        stdout: error.stdout || "",
        stderr: error.stderr || "",
        message: `Error executing command: ${errorMessage}`,
      };
    }
  },
});
