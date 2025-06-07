import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { VitePlugin } from "@electron-forge/plugin-vite";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import pkg from "./package.json";

const config: ForgeConfig = {
  packagerConfig: {
    executableName: pkg.name,
    name: pkg.productName,
    icon: "./images/icon",
    // Ensure native modules are properly handled
    asar: {
      unpack: "**/node_modules/@hurdlegroup/robotjs/**/*",
    },
  },

  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerRpm({}),
    new MakerDeb({
      options: {
        icon: "./images/icon.icns",
      },
    }),
    {
      name: "@electron-forge/maker-dmg",
      config: {
        icon: "./images/icon.icns",
        format: "ULFO",
        overwrite: true,
      },
    },
  ],
  plugins: [
    // Enhanced AutoUnpackNativesPlugin configuration for better native module handling
    new AutoUnpackNativesPlugin({
      // Explicitly specify robotjs for unpacking
      packageConfig: {
        "@hurdlegroup/robotjs": {
          // Ensure the native binaries are properly unpacked
          unpack: true,
        },
      },
    }),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: "src/electron/main.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.mts",
        },
      ],
    }),

    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
