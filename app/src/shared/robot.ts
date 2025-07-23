import type * as RobotJS from "@hurdlegroup/robotjs";
import path from "path";

/**
 * Comprehensive RobotJS Loader
 *
 * Tries multiple strategies to load robotjs in packaged apps.
 */

let robotjs: typeof RobotJS | undefined;

// Helper function to try loading from a path
function tryLoadRobotJS(robotPath: string): typeof RobotJS | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded = require(robotPath);
    console.log(`✅ Successfully loaded robotjs from: ${robotPath}`);
    return loaded;
  } catch (error) {
    console.log(
      `❌ Failed to load from ${robotPath}:`,
      (error as Error).message,
    );
    return undefined;
  }
}

// Strategy 1: Normal require (works in development)
robotjs = tryLoadRobotJS("@hurdlegroup/robotjs");

if (!robotjs) {
  // Strategy 2: Try various packaged locations
  const possiblePaths = [
    // Unpacked asar locations
    path.join(
      process.resourcesPath,
      "app.asar.unpacked",
      "node_modules",
      "@hurdlegroup",
      "robotjs",
    ),
    // Direct resource paths
    path.join(process.resourcesPath, "robotjs"),
    path.join(process.resourcesPath, "node_modules", "@hurdlegroup", "robotjs"),
    // Relative to current file
    path.join(__dirname, "..", "..", "node_modules", "@hurdlegroup", "robotjs"),
    path.join(
      __dirname,
      "..",
      "..",
      "..",
      "node_modules",
      "@hurdlegroup",
      "robotjs",
    ),
    // Alternative app structure
    path.join(
      process.resourcesPath,
      "app",
      "node_modules",
      "@hurdlegroup",
      "robotjs",
    ),
  ];

  console.log(
    `🔍 Trying ${possiblePaths.length} alternative paths for robotjs...`,
  );
  console.log(`📍 process.resourcesPath: ${process.resourcesPath}`);
  console.log(`📍 __dirname: ${__dirname}`);

  for (const robotPath of possiblePaths) {
    const loaded = tryLoadRobotJS(robotPath);
    if (loaded) {
      robotjs = loaded;
      break;
    }
  }
}

// Strategy 3: Try to find robotjs.node directly
if (!robotjs) {
  console.log("🔧 Trying to load robotjs.node directly...");

  const nodePaths = [
    path.join(
      process.resourcesPath,
      "app.asar.unpacked",
      "node_modules",
      "@hurdlegroup",
      "robotjs",
      "build",
      "Release",
      "robotjs.node",
    ),
    path.join(
      process.resourcesPath,
      "robotjs",
      "build",
      "Release",
      "robotjs.node",
    ),
    path.join(
      process.resourcesPath,
      "node_modules",
      "@hurdlegroup",
      "robotjs",
      "build",
      "Release",
      "robotjs.node",
    ),
  ];

  for (const nodePath of nodePaths) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const nativeModule = require(nodePath);
      console.log(`✅ Successfully loaded robotjs.node from: ${nodePath}`);
      robotjs = nativeModule;
      break;
    } catch (error) {
      console.log(
        `❌ Failed to load robotjs.node from ${nodePath}:`,
        (error as Error).message,
      );
    }
  }
}

if (!robotjs) {
  // List available directories for debugging
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs");
    console.log("📁 Available directories for debugging:");

    if (fs.existsSync(process.resourcesPath)) {
      const resourcesContent = fs.readdirSync(process.resourcesPath);
      console.log(
        `  - Resources (${process.resourcesPath}):`,
        resourcesContent,
      );
    }

    const possibleNodeModulesPaths = [
      path.join(process.resourcesPath, "app.asar.unpacked", "node_modules"),
      path.join(process.resourcesPath, "node_modules"),
      path.join(process.resourcesPath, "app", "node_modules"),
    ];

    for (const nmPath of possibleNodeModulesPaths) {
      if (fs.existsSync(nmPath)) {
        const nmContent = fs.readdirSync(nmPath);
        console.log(`  - Node modules (${nmPath}):`, nmContent);

        const hurdlegroupPath = path.join(nmPath, "@hurdlegroup");
        if (fs.existsSync(hurdlegroupPath)) {
          const hurdlegroupContent = fs.readdirSync(hurdlegroupPath);
          console.log(
            `  - @hurdlegroup (${hurdlegroupPath}):`,
            hurdlegroupContent,
          );
        }
      }
    }
  } catch (debugError) {
    console.warn("❌ Debug directory listing failed:", debugError);
  }

  console.warn(
    "⚠️  RobotJS could not be loaded. Keyboard/mouse automation will be disabled.",
  );

  // Create a stub that logs warnings instead of throwing errors
  robotjs = {
    keyTap: (...args: unknown[]) => {
      console.warn("RobotJS not available: keyTap called with", args);
    },
    keyToggle: (...args: unknown[]) => {
      console.warn("RobotJS not available: keyToggle called with", args);
    },
    typeString: (...args: unknown[]) => {
      console.warn("RobotJS not available: typeString called with", args);
    },
    mouseClick: (...args: unknown[]) => {
      console.warn("RobotJS not available: mouseClick called with", args);
    },
    moveMouse: (...args: unknown[]) => {
      console.warn("RobotJS not available: moveMouse called with", args);
    },
    getMousePos: () => {
      console.warn("RobotJS not available: getMousePos called");
      return { x: 0, y: 0 };
    },
    getScreenSize: () => {
      console.warn("RobotJS not available: getScreenSize called");
      return { width: 1920, height: 1080 };
    },
  } as typeof RobotJS;
}

export default robotjs;
