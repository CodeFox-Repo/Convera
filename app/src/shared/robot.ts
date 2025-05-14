import path from "path";

let robotjs;

if (process.env.NODE_ENV === "development") {
  // For development
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  robotjs = require("@hurdlegroup/robotjs");
} else {
  // use to pack the app
  const bin = path.join(
    process.resourcesPath,
    "app.asar.unpacked",
    "node_modules",
    "@hurdlegroup",
    "robotjs",
    "build",
    "Release",
    "robotjs.node",
  );
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  robotjs = require(bin);
}

export default robotjs;
