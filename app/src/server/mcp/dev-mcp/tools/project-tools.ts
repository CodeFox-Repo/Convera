/**
 * Project management tools for agents
 */
import { tool } from "ai";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { z } from "zod";

// Import from listProjectStructureTool (these functions will be used directly)
import { buildFileTree, formatFileTree } from "./list-project-structure-tool";

/**
 * Tool for initializing a new project from a template
 */
export const initProjectTool = tool({
  description:
    "Initialize a new project by copying a template to the specified directory",
  parameters: z.object({
    targetDir: z
      .string()
      .describe("The absolute path where the project should be initialized"),
  }),
  execute: async ({ targetDir }) => {
    try {
      // Resolve the target directory path
      let fullTargetPath = targetDir;
      if (targetDir.startsWith("~")) {
        fullTargetPath = path.join(os.homedir(), targetDir.slice(1));
      } else if (!path.isAbsolute(targetDir)) {
        fullTargetPath = path.resolve(process.cwd(), targetDir);
      }

      // Log the resolved target path for debugging
      console.log(`Initializing project at: ${fullTargetPath}`);

      // Ensure target directory exists
      await fs.ensureDir(fullTargetPath);

      // Fixed template name
      const templateName = "new-template";

      // Resolve the source template path
      const appRoot = process.env.APP_ROOT || process.cwd();
      const templatePath = path.join(appRoot, "template", templateName);

      // Check if template exists
      if (!(await fs.pathExists(templatePath))) {
        return {
          success: false,
          message: `Template '${templateName}' not found at path: ${templatePath}`,
        };
      }

      // Copy template to target directory
      await fs.copy(templatePath, fullTargetPath, {
        overwrite: true,
        errorOnExist: false,
      });

      // Update package.json if it exists
      const packageJsonPath = path.join(fullTargetPath, "package.json");
      if (await fs.pathExists(packageJsonPath)) {
        const packageJson = await fs.readJson(packageJsonPath);
        // Use the directory name as the project name
        const dirName = path.basename(fullTargetPath);
        packageJson.name = dirName;
        await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
      }

      // Get the file structure after initialization
      const ignorePatterns = [
        "node_modules",
        "dist",
        "build",
        ".git",
        "*.log",
        "coverage",
      ];
      const tree = await buildFileTree(
        fullTargetPath,
        fullTargetPath,
        10,
        0,
        ignorePatterns,
      );
      const fileStructure = formatFileTree(tree || "");

      return {
        success: true,
        message: `Project initialized successfully at ${fullTargetPath}\n\nWorking Directory: ${fullTargetPath}\n\nFile Structure:\n${fileStructure}`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to initialize project: ${errorMessage}`,
      };
    }
  },
});
