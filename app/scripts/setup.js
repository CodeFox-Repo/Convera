/**
 * Setup script for FoxyChat development environment
 * Downloads and sets up portable Node.js and installs MCP packages
 */

const { downloadAndSetupNode } = require("./download-node");
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

async function main() {
  console.log("🚀 Setting up FoxyChat development environment...");

  try {
    // Check if Node.js is already downloaded
    const nodeDir = path.join(__dirname, "..", "resources", "node");
    const nodeExists = fs.existsSync(nodeDir);

    if (nodeExists) {
      console.log("📁 Node.js already exists, skipping download...");
    } else {
      console.log("📥 Downloading portable Node.js...");
      await downloadAndSetupNode();
    }

    // Install required npm packages for the download script
    console.log("📦 Installing required dependencies...");
    try {
      execSync("npm install tar yauzl --save-dev", {
        stdio: "inherit",
        cwd: path.join(__dirname, ".."),
      });
    } catch (error) {
      console.warn(
        "⚠️  Could not install dependencies automatically. Please run manually: npm install tar yauzl --save-dev",
      );
    }

    // Install MCP packages for portable Node.js
    console.log("🔧 Installing MCP packages for portable Node.js...");
    const portableNodeBin = path.join(
      __dirname,
      "..",
      "resources",
      "node",
      "bin",
      "npm",
    );
    const portableNodeDir = path.join(__dirname, "..", "resources", "node");

    if (fs.existsSync(portableNodeBin)) {
      try {
        const env = {
          ...process.env,
          NODE_PATH: path.join(portableNodeDir, "lib", "node_modules"),
          NPM_CONFIG_PREFIX: portableNodeDir,
          NPM_CONFIG_GLOBAL_FOLDER: path.join(
            portableNodeDir,
            "lib",
            "node_modules",
          ),
          NPM_CONFIG_CACHE: path.join(portableNodeDir, ".npm"),
        };

        console.log("📦 Installing @foxychat-mcp/apple-calendar...");
        execSync(
          `"${portableNodeBin}" install -g @foxychat-mcp/apple-calendar`,
          {
            stdio: "inherit",
            env,
          },
        );

        console.log("📦 Installing @foxychat-mcp/apple-imessages...");
        execSync(
          `"${portableNodeBin}" install -g @foxychat-mcp/apple-imessages`,
          {
            stdio: "inherit",
            env,
          },
        );

        console.log("📦 Installing mcp-remote...");
        execSync(`"${portableNodeBin}" install -g mcp-remote`, {
          stdio: "inherit",
          env,
        });

        console.log("📦 Installing @playwright/mcp...");
        execSync(`"${portableNodeBin}" install -g @playwright/mcp`, {
          stdio: "inherit",
          env,
        });

        console.log("✅ MCP packages installed in portable Node.js!");
      } catch (error) {
        console.warn(
          "⚠️  Could not install MCP packages in portable Node.js:",
          error.message,
        );
      }
    } else {
      console.warn(
        "⚠️  Portable Node.js not found, skipping MCP package installation.",
      );
    }

    // Also install globally for system (optional)
    console.log("🔧 Installing MCP packages globally for system...");
    const installScript = path.join(__dirname, "install-mcp-packages.sh");
    if (fs.existsSync(installScript)) {
      try {
        execSync(`chmod +x "${installScript}" && "${installScript}"`, {
          stdio: "inherit",
          shell: true,
        });
      } catch (error) {
        console.warn(
          "⚠️  Could not run system MCP package installation script.",
        );
      }
    }

    console.log("✅ Setup completed successfully!");
    console.log("");
    console.log("🎉 You can now run:");
    console.log("   pnpm start  - Start development server");
    console.log("   pnpm make   - Build packaged application");
  } catch (error) {
    console.error("❌ Setup failed:", error.message);
    process.exit(1);
  }
}

// Run setup if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = { main };
