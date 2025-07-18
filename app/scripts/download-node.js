const https = require("https");
const fs = require("fs");
const path = require("path");
const { createReadStream, createWriteStream } = require("fs");
const { pipeline } = require("stream");
const { promisify } = require("util");

const streamPipeline = promisify(pipeline);

// Node.js 版本配置
const NODE_VERSION = "v20.19.2";
const DOWNLOAD_BASE_URL = "https://nodejs.org/dist";

/**
 * 获取当前平台的 Node.js 下载信息
 */
function getNodeDownloadInfo() {
  const platform = process.platform;
  const arch = process.arch;

  let fileName, url;

  if (platform === "win32") {
    fileName = `node-${NODE_VERSION}-win-${arch}.zip`;
  } else if (platform === "darwin") {
    fileName = `node-${NODE_VERSION}-darwin-${arch}.tar.gz`;
  } else if (platform === "linux") {
    fileName = `node-${NODE_VERSION}-linux-${arch}.tar.xz`;
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  url = `${DOWNLOAD_BASE_URL}/${NODE_VERSION}/${fileName}`;

  return { fileName, url, platform, arch };
}

/**
 * 下载文件
 */
function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    console.log(`📥 Downloading: ${url}`);
    console.log(`📁 Destination: ${destination}`);

    const file = createWriteStream(destination);
    const request = https.get(url, (response) => {
      if (response.statusCode === 200) {
        const totalSize = parseInt(response.headers["content-length"], 10);
        let downloadedSize = 0;

        response.on("data", (chunk) => {
          downloadedSize += chunk.length;
          const progress = ((downloadedSize / totalSize) * 100).toFixed(1);
          process.stdout.write(
            `\r⬇️  Progress: ${progress}% (${Math.round(downloadedSize / 1024 / 1024)}MB / ${Math.round(totalSize / 1024 / 1024)}MB)`,
          );
        });

        response.pipe(file);

        file.on("finish", () => {
          file.close();
          console.log("\n✅ Download completed!");
          resolve();
        });

        file.on("error", (err) => {
          fs.unlink(destination, () => {});
          reject(err);
        });
      } else if (response.statusCode === 302 || response.statusCode === 301) {
        // 处理重定向
        downloadFile(response.headers.location, destination)
          .then(resolve)
          .catch(reject);
      } else {
        reject(
          new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`),
        );
      }
    });

    request.on("error", (err) => {
      fs.unlink(destination, () => {});
      reject(err);
    });
  });
}

/**
 * 解压 tar.gz 文件 (使用 node-tar)
 */
async function extractTarGz(filePath, extractPath) {
  const tar = require("tar");

  console.log(`📦 Extracting: ${filePath}`);
  console.log(`📁 Extract to: ${extractPath}`);

  await tar.extract({
    file: filePath,
    cwd: extractPath,
    strip: 1, // 移除顶层目录
    filter: (path, entry) => {
      // 显示进度
      if (entry.type === "File") {
        process.stdout.write(`\r📂 Extracting: ${path.substring(0, 50)}...`);
      }
      return true;
    },
  });

  console.log("\n✅ Extraction completed!");
}

/**
 * 解压 zip 文件 (使用 node 内置)
 */
async function extractZip(filePath, extractPath) {
  const yauzl = require("yauzl");

  return new Promise((resolve, reject) => {
    console.log(`📦 Extracting: ${filePath}`);
    console.log(`📁 Extract to: ${extractPath}`);

    yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);

      let extractedCount = 0;
      const totalEntries = zipfile.entryCount;

      zipfile.readEntry();
      zipfile.on("entry", (entry) => {
        const fullPath = path.join(extractPath, entry.fileName);

        if (/\/$/.test(entry.fileName)) {
          // Directory
          fs.mkdirSync(fullPath, { recursive: true });
          zipfile.readEntry();
        } else {
          // File
          zipfile.openReadStream(entry, (err, readStream) => {
            if (err) return reject(err);

            // 确保目录存在
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });

            const writeStream = createWriteStream(fullPath);
            readStream.pipe(writeStream);

            writeStream.on("close", () => {
              extractedCount++;
              const progress = ((extractedCount / totalEntries) * 100).toFixed(
                1,
              );
              process.stdout.write(
                `\r📂 Progress: ${progress}% (${extractedCount}/${totalEntries})`,
              );

              zipfile.readEntry();
            });
          });
        }
      });

      zipfile.on("end", () => {
        console.log("\n✅ Extraction completed!");
        resolve();
      });
    });
  });
}

/**
 * 安装依赖包
 */
function installDependencies() {
  console.log("📦 Installing required dependencies...");
  const { execSync } = require("child_process");

  try {
    // 安装 tar 包用于解压
    execSync("npm install tar yauzl --save-dev", { stdio: "inherit" });
    console.log("✅ Dependencies installed!");
  } catch (error) {
    console.warn(
      "⚠️  Could not install dependencies automatically. Please run: npm install tar yauzl --save-dev",
    );
  }
}

/**
 * 设置可执行权限 (Unix 系统)
 */
function setExecutablePermissions(nodeDir) {
  if (process.platform !== "win32") {
    console.log("🔒 Setting executable permissions...");

    const nodeBin = path.join(nodeDir, "bin", "node");
    const npmBin = path.join(nodeDir, "bin", "npm");
    const npxBin = path.join(nodeDir, "bin", "npx");

    try {
      if (fs.existsSync(nodeBin)) fs.chmodSync(nodeBin, "755");
      if (fs.existsSync(npmBin)) fs.chmodSync(npmBin, "755");
      if (fs.existsSync(npxBin)) fs.chmodSync(npxBin, "755");

      console.log("✅ Executable permissions set!");
    } catch (error) {
      console.warn("⚠️  Could not set executable permissions:", error.message);
    }
  }
}

/**
 * 主函数：下载并设置 Node.js
 */
async function downloadAndSetupNode() {
  try {
    console.log("🚀 Starting Node.js download and setup...");
    console.log(`📋 Platform: ${process.platform} ${process.arch}`);
    console.log(`📋 Node.js version: ${NODE_VERSION}`);

    // 获取下载信息
    const { fileName, url, platform } = getNodeDownloadInfo();

    // 设置路径
    const resourcesDir = path.join(__dirname, "..", "resources");
    const nodeDir = path.join(resourcesDir, "node");
    const downloadPath = path.join(resourcesDir, fileName);

    // 创建目录
    if (!fs.existsSync(resourcesDir)) {
      fs.mkdirSync(resourcesDir, { recursive: true });
    }

    // 检查是否已经存在
    if (fs.existsSync(nodeDir)) {
      console.log("📁 Node.js directory already exists, removing...");
      fs.rmSync(nodeDir, { recursive: true, force: true });
    }

    fs.mkdirSync(nodeDir, { recursive: true });

    // 检查是否需要安装依赖
    try {
      require("tar");
      require("yauzl");
    } catch (error) {
      installDependencies();
    }

    // 下载文件
    await downloadFile(url, downloadPath);

    // 解压文件
    if (platform === "win32") {
      await extractZip(downloadPath, nodeDir);
    } else {
      await extractTarGz(downloadPath, nodeDir);
    }

    // 设置可执行权限
    setExecutablePermissions(nodeDir);

    // 清理下载文件
    console.log("🧹 Cleaning up download file...");
    fs.unlinkSync(downloadPath);

    // 验证安装
    console.log("🔍 Verifying installation...");
    const nodeExe =
      platform === "win32"
        ? path.join(nodeDir, "node.exe")
        : path.join(nodeDir, "bin", "node");

    if (fs.existsSync(nodeExe)) {
      console.log("✅ Node.js installation verified!");
      console.log(`📁 Node.js location: ${nodeExe}`);

      // 显示版本信息
      const { execSync } = require("child_process");
      try {
        const version = execSync(`"${nodeExe}" --version`, {
          encoding: "utf8",
        }).trim();
        console.log(`📋 Node.js version: ${version}`);
      } catch (error) {
        console.warn("⚠️  Could not verify Node.js version");
      }
    } else {
      throw new Error("Node.js executable not found after extraction");
    }

    console.log("🎉 Node.js setup completed successfully!");
  } catch (error) {
    console.error("❌ Error during Node.js setup:", error.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  downloadAndSetupNode();
}

module.exports = { downloadAndSetupNode };
