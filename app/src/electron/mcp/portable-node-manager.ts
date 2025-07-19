/**
 * PortableNodeManager - 管理内置的 Node.js 环境
 * 提供独立的 Node.js/npm/npx 执行环境，不依赖系统安装
 */

import { app } from "electron";
import { spawn, ChildProcess, SpawnOptions } from "child_process";
import { promises as fs } from "fs";
import * as path from "path";
import { getLogger } from "../logger";

const logger = getLogger("PortableNodeManager");

export interface NodeExecutionOptions extends Omit<SpawnOptions, "env"> {
  env?: Record<string, string>;
  timeout?: number;
}

export interface NodeProcessResult {
  process: ChildProcess;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export class PortableNodeManager {
  private nodePath: string;
  private npmPath: string;
  private npxPath: string;
  private nodeDir: string;
  private initialized = false;

  constructor() {
    this.nodeDir = this.getNodeDirectory();
    this.nodePath = this.getNodeExecutablePath();
    this.npmPath = this.getNpmPath();
    this.npxPath = this.getNpxPath();
  }

  /**
   * 获取 Node.js 目录路径
   */
  private getNodeDirectory(): string {
    if (app.isPackaged) {
      // 打包应用中的 Node.js 路径
      return path.join(process.resourcesPath, "node");
    } else {
      // 开发环境中的 Node.js 路径
      return path.join(__dirname, "..", "..", "..", "resources", "node");
    }
  }

  /**
   * 获取 Node.js 可执行文件路径
   */
  private getNodeExecutablePath(): string {
    const platform = process.platform;

    if (platform === "win32") {
      return path.join(this.nodeDir, "node.exe");
    } else {
      return path.join(this.nodeDir, "bin", "node");
    }
  }

  /**
   * 获取 npm 可执行文件路径
   */
  private getNpmPath(): string {
    const platform = process.platform;

    if (platform === "win32") {
      return path.join(this.nodeDir, "npm.cmd");
    } else {
      return path.join(this.nodeDir, "bin", "npm");
    }
  }

  /**
   * 获取 npx 可执行文件路径
   */
  private getNpxPath(): string {
    const platform = process.platform;

    if (platform === "win32") {
      return path.join(this.nodeDir, "npx.cmd");
    } else {
      return path.join(this.nodeDir, "bin", "npx");
    }
  }

  /**
   * 获取环境变量配置
   */
  getEnvironment(
    additionalEnv: Record<string, string> = {},
  ): Record<string, string> {
    const binDir =
      process.platform === "win32"
        ? this.nodeDir
        : path.join(this.nodeDir, "bin");
    const libDir = path.join(this.nodeDir, "lib", "node_modules");

    return {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
      NODE_PATH: libDir,
      NPM_CONFIG_PREFIX: this.nodeDir,
      NPM_CONFIG_CACHE: path.join(this.nodeDir, ".npm"),
      NPM_CONFIG_GLOBAL_FOLDER: path.join(this.nodeDir, "lib", "node_modules"),
      NPM_CONFIG_GLOBAL: "true",
      // 禁用 npm 更新检查以提高性能
      NPM_CONFIG_UPDATE_NOTIFIER: "false",
      NO_UPDATE_NOTIFIER: "1",
      ...additionalEnv,
    };
  }

  /**
   * 检查内置 Node.js 是否可用
   */
  async isAvailable(): Promise<boolean> {
    try {
      await fs.access(this.nodePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 初始化内置 Node.js 环境
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.debug("PortableNodeManager already initialized, skipping");
      return;
    }

    logger.info("Initializing portable Node.js environment");
    logger.info(`Node directory: ${this.nodeDir}`);
    logger.info(`Node executable: ${this.nodePath}`);

    const available = await this.isAvailable();
    if (!available) {
      throw new Error(
        `Portable Node.js not found at ${this.nodePath}. Please run the setup script first.`,
      );
    }

    // 验证 Node.js 版本
    try {
      const versionResult = await this.runNodeCommand(["--version"], {
        timeout: 5000,
      });
      logger.info(`Portable Node.js version: ${versionResult.stdout.trim()}`);
    } catch (error) {
      logger.error("Failed to verify Node.js version:", error);
      throw new Error("Portable Node.js is not working correctly");
    }

    // 确保 npm 缓存目录存在
    const npmCacheDir = path.join(this.nodeDir, ".npm");
    try {
      await fs.mkdir(npmCacheDir, { recursive: true });
    } catch (error) {
      logger.warn("Could not create npm cache directory:", error);
    }

    this.initialized = true;
    logger.info("Portable Node.js environment initialized successfully");
  }

  /**
   * 运行 Node.js 命令
   */
  async runNodeCommand(
    args: string[],
    options: NodeExecutionOptions = {},
  ): Promise<NodeProcessResult> {
    // Don't auto-initialize here to avoid recursion during initialization
    logger.debug(`Running node command: ${this.nodePath} ${args.join(" ")}`);

    return this.executeCommand(this.nodePath, args, options);
  }

  /**
   * 运行 npm 命令
   */
  async runNpmCommand(
    args: string[],
    options: NodeExecutionOptions = {},
  ): Promise<NodeProcessResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    logger.debug(`Running npm command: ${this.npmPath} ${args.join(" ")}`);

    return this.executeCommand(this.npmPath, args, options);
  }

  /**
   * 运行 npx 命令
   */
  async runNpxCommand(
    args: string[],
    options: NodeExecutionOptions = {},
  ): Promise<NodeProcessResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    logger.debug(`Running npx command: ${this.npxPath} ${args.join(" ")}`);

    return this.executeCommand(this.npxPath, args, options);
  }

  /**
   * 创建 npx 进程（用于 stdio 连接）
   */
  createNpxProcess(
    args: string[],
    options: NodeExecutionOptions = {},
  ): ChildProcess {
    if (!this.initialized) {
      throw new Error(
        "PortableNodeManager not initialized. Call initialize() first.",
      );
    }

    logger.debug(`Creating npx process: ${this.npxPath} ${args.join(" ")}`);

    const env = this.getEnvironment(options.env);

    const spawnOptions: SpawnOptions = {
      ...options,
      env,
    };

    return spawn(this.npxPath, args, spawnOptions);
  }

  /**
   * 通用命令执行方法
   */
  private async executeCommand(
    command: string,
    args: string[],
    options: NodeExecutionOptions = {},
  ): Promise<NodeProcessResult> {
    return new Promise((resolve, reject) => {
      const env = this.getEnvironment(options.env);
      const { timeout = 30000, ...spawnOptions } = options;

      const process = spawn(command, args, {
        ...spawnOptions,
        env,
      });

      let stdout = "";
      let stderr = "";
      let timeoutId: NodeJS.Timeout | null = null;

      // 设置超时
      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          process.kill("SIGTERM");
          reject(new Error(`Command timed out after ${timeout}ms`));
        }, timeout);
      }

      // 收集输出
      if (process.stdout) {
        process.stdout.on("data", (data) => {
          stdout += data.toString();
        });
      }

      if (process.stderr) {
        process.stderr.on("data", (data) => {
          stderr += data.toString();
        });
      }

      process.on("close", (code) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        const result: NodeProcessResult = {
          process,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code,
        };

        if (code === 0) {
          resolve(result);
        } else {
          const error = new Error(
            `Command failed with exit code ${code}: ${stderr || stdout}`,
          );
          (error as Error & { result: NodeProcessResult }).result = result;
          reject(error);
        }
      });

      process.on("error", (error) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        reject(error);
      });
    });
  }

  /**
   * 安装 npm 包
   */
  async installPackage(
    packageName: string,
    options: { global?: boolean; save?: boolean; dev?: boolean } = {},
  ): Promise<NodeProcessResult> {
    const args = ["install"];

    if (options.global) {
      args.push("-g");
    }

    if (options.save) {
      args.push("--save");
    }

    if (options.dev) {
      args.push("--save-dev");
    }

    args.push(packageName);

    logger.info(`Installing package: ${packageName} with options:`, options);

    return this.runNpmCommand(args, { timeout: 120000 }); // 2分钟超时
  }

  /**
   * 检查包是否已安装
   */
  async isPackageInstalled(
    packageName: string,
    global = false,
  ): Promise<boolean> {
    try {
      const args = ["list", packageName, "--depth=0"];
      if (global) {
        args.push("-g");
      }

      await this.runNpmCommand(args, { timeout: 10000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取 Node.js 路径信息
   */
  getNodePaths() {
    return {
      nodeDir: this.nodeDir,
      nodePath: this.nodePath,
      npmPath: this.npmPath,
      npxPath: this.npxPath,
    };
  }

  /**
   * 获取 Node.js 版本信息
   */
  async getNodeVersion(): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }

    const result = await this.runNodeCommand(["--version"]);
    return result.stdout.trim();
  }

  /**
   * 获取 npm 版本信息
   */
  async getNpmVersion(): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }

    const result = await this.runNpmCommand(["--version"]);
    return result.stdout.trim();
  }
}

// 单例实例
let portableNodeManager: PortableNodeManager | null = null;

/**
 * 获取 PortableNodeManager 单例实例
 */
export function getPortableNodeManager(): PortableNodeManager {
  if (!portableNodeManager) {
    portableNodeManager = new PortableNodeManager();
  }
  return portableNodeManager;
}
