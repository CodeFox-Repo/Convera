/**
 * Project management tools for agents
 */
import { z } from "zod";
import fs from "fs-extra";
import path from "path";
import os from "os";

/**
 * Helper function to build a file tree
 */
export async function buildFileTree(
  rootPath: string,
  currentPath: string,
  maxDepth: number,
  currentDepth: number,
  ignorePatterns: string[] = [],
): Promise<string | null> {
  if (currentDepth > maxDepth) return null;

  try {
    const stats = await fs.stat(currentPath);
    const relativePath = path.relative(rootPath, currentPath);
    const name = path.basename(currentPath);

    // Check if this path should be ignored
    const shouldIgnore = ignorePatterns.some((pattern) => {
      if (pattern.startsWith("*")) {
        return name.endsWith(pattern.slice(1));
      }
      return relativePath === pattern || name === pattern;
    });

    if (shouldIgnore) return null;

    if (stats.isDirectory()) {
      const files = await fs.readdir(currentPath);
      const children = await Promise.all(
        files.map(async (file) => {
          const childPath = path.join(currentPath, file);
          return await buildFileTree(
            rootPath,
            childPath,
            maxDepth,
            currentDepth + 1,
            ignorePatterns,
          );
        }),
      );

      const validChildren = children.filter((child) => child !== null);
      if (validChildren.length === 0) {
        return relativePath ? `${relativePath}/ (empty)` : "./ (empty)";
      }

      return `${relativePath || "./"}\n${validChildren.join("\n")}`;
    } else {
      return relativePath || "./";
    }
  } catch (error) {
    console.error(`Error processing path ${currentPath}:`, error);
    return null;
  }
}

/**
 * Helper function to format file tree for display
 */
export function formatFileTree(tree: string): string {
  const lines = tree.split("\n");
  const result: string[] = [];
  let indent = "";

  for (const line of lines) {
    if (line.endsWith("/")) {
      // Directory
      result.push(`${indent}📁 ${line}`);
      indent += "  ";
    } else if (line.endsWith("/ (empty)")) {
      // Empty directory
      result.push(`${indent}📁 ${line.replace("/ (empty)", "/")} (empty)`);
    } else if (line.trim() === "") {
      // Empty line
      continue;
    } else if (line.startsWith("./")) {
      // Root
      result.push(`📦 ${line}`);
      indent = "  ";
    } else {
      // File
      result.push(`${indent}📄 ${line}`);
    }
  }

  return result.join("\n");
}

/**
 * Tool schema for initializing a new project
 */
export const initProjectSchema = {
  name: "initProjectTool",
  description:
    "Initialize a new project by copying a template to the specified directory",
  schema: z.object({
    targetDir: z
      .string()
      .describe("The absolute path where the project should be initialized"),
  }),
};

/**
 * Initialize a new project from a template
 */
export async function initProject(params: {
  targetDir: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const { targetDir } = params;

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
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Failed to initialize project: ${errorMessage}`,
    };
  }
}
