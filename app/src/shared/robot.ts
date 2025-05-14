import path from "path";

// use to pack the app
const bin = path.join(
  process.resourcesPath, // …/FoxyChat.app/Contents/Resources
  "app.asar.unpacked",
  "node_modules",
  "@hurdlegroup",
  "robotjs",
  "build",
  "Release",
  "robotjs.node",
);
// eslint-disable-next-line @typescript-eslint/no-require-imports
export default require(bin);
