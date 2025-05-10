/**
 * File operation tools for agents
 */
import { tool } from "ai";
import { z } from "zod";
import fs from "fs-extra";
import path from "path";
import os from "os";

/**
 * Tool for creating or updating files
 */
export const writeFileTool = tool({
  description: "Create or update a file with the specified content",
  parameters: z.object({
    path: z.string().describe("The absolute or relative file path"),
    content: z.string().describe("The content to write to the file"),
  }),
  execute: async ({ path: filePath, content }) => {
    try {
      // Resolve the file path
      let fullPath = filePath;
      if (filePath.startsWith("~")) {
        fullPath = path.join(os.homedir(), filePath.slice(1));
      } else if (!path.isAbsolute(filePath)) {
        fullPath = path.resolve(process.cwd(), filePath);
      }

      const dirPath = path.dirname(fullPath);
      await fs.ensureDir(dirPath);
      await fs.writeFile(fullPath, content);

      return {
        success: true,
        message: `File created/updated: ${fullPath}`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to write file: ${errorMessage}`,
      };
    }
  },
});

/**
 * Tool for renaming files
 */
export const renameFileTool = tool({
  description: "Rename a file from one path to another",
  parameters: z.object({
    from: z.string().describe("The current file path (absolute or relative)"),
    to: z.string().describe("The new file path (absolute or relative)"),
  }),
  execute: async ({ from, to }) => {
    try {
      // Resolve the file paths
      let fullOldPath = from;
      if (from.startsWith("~")) {
        fullOldPath = path.join(os.homedir(), from.slice(1));
      } else if (!path.isAbsolute(from)) {
        fullOldPath = path.resolve(process.cwd(), from);
      }

      let fullNewPath = to;
      if (to.startsWith("~")) {
        fullNewPath = path.join(os.homedir(), to.slice(1));
      } else if (!path.isAbsolute(to)) {
        fullNewPath = path.resolve(process.cwd(), to);
      }

      const newDirPath = path.dirname(fullNewPath);
      await fs.ensureDir(newDirPath);
      await fs.rename(fullOldPath, fullNewPath);

      return {
        success: true,
        message: `File renamed from ${fullOldPath} to ${fullNewPath}`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to rename file: ${errorMessage}`,
      };
    }
  },
});

/**
 * Tool for deleting files
 */
export const deleteFileTool = tool({
  description: "Delete a file",
  parameters: z.object({
    path: z.string().describe("The absolute or relative file path"),
  }),
  execute: async ({ path: filePath }) => {
    try {
      // Resolve the file path
      let fullPath = filePath;
      if (filePath.startsWith("~")) {
        fullPath = path.join(os.homedir(), filePath.slice(1));
      } else if (!path.isAbsolute(filePath)) {
        fullPath = path.resolve(process.cwd(), filePath);
      }

      if (await fs.pathExists(fullPath)) {
        await fs.remove(fullPath);
        return {
          success: true,
          message: `File deleted: ${fullPath}`,
        };
      } else {
        return {
          success: false,
          message: `File not found: ${fullPath}`,
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to delete file: ${errorMessage}`,
      };
    }
  },
});

/**
 * Tool for adding dependencies to package.json
 */
export const addDependencyTool = tool({
  description: "Add a dependency to a project",
  parameters: z.object({
    path: z
      .string()
      .describe(
        "The absolute path to the project directory containing package.json",
      ),
    name: z.string().describe("The name of the package to add"),
    version: z
      .string()
      .optional()
      .describe("The version of the package (optional)"),
  }),
  execute: async ({ path: projectPath, name, version }) => {
    try {
      // Resolve project path
      let resolvedProjectPath = projectPath;
      if (projectPath.startsWith("~")) {
        resolvedProjectPath = path.join(os.homedir(), projectPath.slice(1));
      } else if (!path.isAbsolute(projectPath)) {
        resolvedProjectPath = path.resolve(process.cwd(), projectPath);
      }

      const packageJsonPath = path.join(resolvedProjectPath, "package.json");

      if (await fs.pathExists(packageJsonPath)) {
        const packageJson = await fs.readJson(packageJsonPath);
        if (!packageJson.dependencies) {
          packageJson.dependencies = {};
        }

        packageJson.dependencies[name] = version || "latest";
        await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });

        return {
          success: true,
          message: `Dependency added: ${name}${version ? "@" + version : ""} to ${resolvedProjectPath}`,
        };
      } else {
        return {
          success: false,
          message: `package.json not found in the project directory (${resolvedProjectPath})`,
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to add dependency: ${errorMessage}`,
      };
    }
  },
});
