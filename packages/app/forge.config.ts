import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { VitePlugin } from "@electron-forge/plugin-vite";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import pkg from "./package.json";

const shouldSign =
  process.env.ENABLE_CODE_SIGNING === "true" && process.env.APPLE_IDENTITY;

const config: ForgeConfig = {
  packagerConfig: {
    executableName: pkg.name,
    name: pkg.productName,
    icon: "./public/images/icon",
    // Include images directory in the packaged app
    extraResource: ["./public/images"],
    asar: true,
    ...(shouldSign && {
      osxSign: {
        identity: process.env.APPLE_IDENTITY,
        optionsForFile: () => ({
          hardenedRuntime: true,
          entitlements: "entitlements.plist",
          entitlemenherit: "entitlements.plist",
          signatureFlags: "library",
        }),
      },
      osxNotarize: { keychainProfile: "notary-profile" },
    }),
    extendInfo: {
      NSAppleEventsUsageDescription:
        "Convera needs access to control other applications for seamless integration.",
      NSAccessibilityUsageDescription:
        "Convera needs accessibility permissions to read content from other applications.",
      // Register custom URL scheme so macOS recognizes convera:// links
      CFBundleURLTypes: [
        {
          CFBundleURLName: "convera",
          CFBundleURLSchemes: ["convera"],
        },
      ],
    },
  },

  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerRpm({}),
    new MakerDeb({
      options: {
        icon: "./public/images/icon.icns",
      },
    }),
    {
      name: "@electron-forge/maker-dmg",
      config: {
        icon: "./public/images/icon.icns",
        format: "ULFO",
        overwrite: true,
      },
    },
  ],
  plugins: [
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
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: false,
    }),
  ],
};

export default config;
