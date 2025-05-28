import path from "path";

let robotjs;

if (process.env.NODE_ENV === "development") {
  // For development
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  robotjs = require("@hurdlegroup/robotjs");
} else {
  // Try multiple possible locations for the native module in production
  const possiblePaths = [
    // Standard auto-unpack-natives location
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
    // Alternative location that might be used by auto-unpack-natives
    path.join(
      process.resourcesPath,
      "app.asar.unpacked",
      "node_modules",
      "@hurdlegroup",
      "robotjs",
    ),
    // Fallback to the main package
    path.join(
      process.resourcesPath,
      "app.asar.unpacked",
      "node_modules",
      "@hurdlegroup",
      "robotjs",
      "lib",
      "robotjs.node",
    ),
  ];

  let loaded = false;
  for (const robotjsPath of possiblePaths) {
    try {
      // Try loading the specific .node file first
      if (robotjsPath.endsWith(".node")) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        robotjs = require(robotjsPath);
      } else {
        // Try loading the package
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        robotjs = require(robotjsPath);
      }
      loaded = true;
      console.log(`Successfully loaded robotjs from: ${robotjsPath}`);
      break;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.warn(`Failed to load robotjs from ${robotjsPath}:`, errorMessage);
      continue;
    }
  }

  if (!loaded) {
    console.error("Failed to load robotjs from any location");
    // Provide a fallback that won't crash the app
    robotjs = {
      keyTap: () => console.warn("robotjs not available"),
      keyToggle: () => console.warn("robotjs not available"),
    };
  }
}

export default robotjs;
