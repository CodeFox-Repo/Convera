/**
 * List project structure tool for agents
 */
import { tool } from "ai";
import { z } from "zod";
import fs from "fs-extra";
import path from "path";
import os from "os";

/**
 * File tree node interface
 */
interface FileTreeNode {
  name: string;
  type: "file" | "directory";
  size?: number;
  children?: (FileTreeNode | string)[];
}

/**
 * Helper function to recursively build a file structure tree
 */
export async function buildFileTree(
  dirPath: string,
  basePath: string,
  maxDepth: number = 10,
  currentDepth: number = 0,
  ignorePatterns: string[] = [],
): Promise<FileTreeNode | null> {
  if (currentDepth > maxDepth) {
    return {
      name: path.basename(dirPath),
      type: "directory",
      children: ["[Max depth reached]"],
    };
  }

  try {
    const relativePath = path.relative(basePath, dirPath);
    const name = relativePath || path.basename(dirPath);
    const stats = await fs.stat(dirPath);

    // Check against ignore patterns
    for (const pattern of ignorePatterns) {
      if (minimatch(relativePath, pattern) || minimatch(name, pattern)) {
        return null;
      }
    }

    if (stats.isFile()) {
      return {
        name,
        type: "file",
        size: stats.size,
      };
    }

    if (stats.isDirectory()) {
      const items = await fs.readdir(dirPath);
      const children: FileTreeNode[] = [];

      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        // Skip hidden files/folders
        if (item.startsWith(".")) continue;

        const child = await buildFileTree(
          itemPath,
          basePath,
          maxDepth,
          currentDepth + 1,
          ignorePatterns,
        );

        if (child) {
          children.push(child);
        }
      }

      return {
        name,
        type: "directory",
        children: children.sort((a, b) => {
          // Sort directories first, then files
          if (a.type === "directory" && b.type === "file") return -1;
          if (a.type === "file" && b.type === "directory") return 1;
          return a.name.localeCompare(b.name);
        }),
      };
    }

    return null;
  } catch (error) {
    console.error(`Error processing ${dirPath}:`, error);
    return null;
  }
}

// Simple implementation of minimatch-like behavior for pattern matching
function minimatch(str: string, pattern: string): boolean {
  const regexPattern = pattern
    .replace(/\./g, "\\.")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(str);
}

/**
 * Formats a file tree as a string for display
 */
export function formatFileTree(
  node: FileTreeNode | string,
  indent: string = "",
  isLast: boolean = true,
): string {
  if (!node) return "";

  // Handle string nodes (used for "[Max depth reached]")
  if (typeof node === "string") {
    return `${indent}${isLast ? "└── " : "├── "}${node}\n`;
  }

  let result = indent;
  if (indent) {
    result += isLast ? "└── " : "├── ";
  }

  result += node.name;
  if (node.type === "file" && node.size !== undefined) {
    const sizeStr = formatFileSize(node.size);
    result += ` (${sizeStr})`;
  }
  result += "\n";

  if (node.children && node.children.length) {
    const newIndent = indent + (isLast ? "    " : "│   ");

    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      const isLastChild = i === node.children.length - 1;
      result += formatFileTree(child, newIndent, isLastChild);
    }
  }

  return result;
}

/**
 * Formats file size in a human-readable format
 */
function formatFileSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

// Export FileTreeNode interface for use in other modules
export type { FileTreeNode };

/**
 * Tool for listing a project's file structure
 */
export const listProjectStructureTool = tool({
  description: "List the file structure of a project directory",
  parameters: z.object({
    projectPath: z
      .string()
      .describe(
        "The path to the project directory. Can be relative or absolute path",
      ),
    maxDepth: z
      .number()
      .min(1)
      .max(20)
      .default(10)
      .describe("Maximum depth of directory traversal. Default is 10"),
    ignorePatterns: z
      .array(z.string())
      .optional()
      .default(["node_modules", "dist", "build", ".git", "*.log", "coverage"])
      .describe(
        "Glob patterns for files/directories to ignore. Has sensible defaults",
      ),
  }),
  execute: async ({
    projectPath,
    maxDepth = 10,
    ignorePatterns = [
      "node_modules",
      "dist",
      "build",
      ".git",
      "*.log",
      "coverage",
    ],
  }) => {
    try {
      // Resolve the project directory path
      let fullProjectPath = projectPath;
      if (projectPath.startsWith("~")) {
        fullProjectPath = path.join(os.homedir(), projectPath.slice(1));
      } else if (!path.isAbsolute(projectPath)) {
        fullProjectPath = path.resolve(process.cwd(), projectPath);
      }

      // Check if directory exists
      if (!(await fs.pathExists(fullProjectPath))) {
        return {
          success: false,
          message: `Project directory not found: ${fullProjectPath}`,
        };
      }

      // Get project structure
      const tree = await buildFileTree(
        fullProjectPath,
        fullProjectPath,
        maxDepth,
        0,
        ignorePatterns,
      );

      // Format the tree
      const formattedTree = formatFileTree(tree as FileTreeNode);

      // Get project stats
      const stats = {
        totalFiles: 0,
        totalDirectories: 0,
        totalSize: 0,
      };

      function countStats(node: FileTreeNode | string | null) {
        if (!node || typeof node === "string") return;

        if (node.type === "file") {
          stats.totalFiles++;
          stats.totalSize += node.size || 0;
        } else if (node.type === "directory") {
          stats.totalDirectories++;
          if (node.children) {
            for (const child of node.children) {
              countStats(child as FileTreeNode | string);
            }
          }
        }
      }

      countStats(tree);

      const formattedSize = formatFileSize(stats.totalSize);
      const statsString = `Project Stats:\n- Total Files: ${stats.totalFiles}\n- Total Directories: ${stats.totalDirectories}\n- Total Size: ${formattedSize}`;

      return {
        success: true,
        message: `Project structure for ${fullProjectPath}\n\n${statsString}\n\n${formattedTree}`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to list project structure: ${errorMessage}`,
      };
    }
  },
});
