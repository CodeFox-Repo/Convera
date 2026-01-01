import { exec } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { promisify } from "util";
import {
  BUILTIN_APP_ICONS as BUILTIN_ICONS,
  ERROR_MESSAGES,
  createErrorResult,
} from "@/renderer/assets/builtin-app-icons";

// Platform detection
export function getPlatform(): string {
  return process.platform;
}

// Icon cache system
const iconCache = new Map<string, string>();

// Core function to load app icon from disk
async function loadAppIconFromDisk(appName: string): Promise<string | null> {
  if (process.platform !== "darwin") {
    return null;
  }

  const execAsync = promisify(exec);

  const appPaths = [
    `/Applications/${appName}.app`,
    `/System/Applications/${appName}.app`,
    `/System/Applications/Utilities/${appName}.app`,
  ];

  for (const appPath of appPaths) {
    try {
      if (!fs.existsSync(appPath)) {
        continue;
      }

      const infoPlistPath = path.join(appPath, "Contents", "Info.plist");
      const iconPaths = [];

      if (fs.existsSync(infoPlistPath)) {
        const plistContent = fs.readFileSync(infoPlistPath, "utf8");
        const iconMatch = plistContent.match(
          /<key>CFBundleIconFile<\/key>\s*<string>([^<]+)<\/string>/,
        );
        let iconFileName = iconMatch ? iconMatch[1] : null;

        if (!iconFileName) {
          const iconNameMatch = plistContent.match(
            /<key>CFBundleIconName<\/key>\s*<string>([^<]+)<\/string>/,
          );
          iconFileName = iconNameMatch ? iconNameMatch[1] : null;
        }

        if (iconFileName) {
          if (!iconFileName.endsWith(".icns")) {
            iconFileName += ".icns";
          }
          iconPaths.push(
            path.join(appPath, "Contents", "Resources", iconFileName),
          );
        }
      }

      iconPaths.push(
        path.join(appPath, "Contents", "Resources", "AppIcon.icns"),
        path.join(appPath, "Contents", "Resources", "icon.icns"),
        path.join(appPath, "Contents", "Resources", "Icon.icns"),
        path.join(appPath, "Contents", "Resources", "app.icns"),
      );

      // Try each icon path
      for (const iconPath of iconPaths) {
        if (fs.existsSync(iconPath)) {
          try {
            // Use sips to convert to PNG
            const tmpDir = os.tmpdir();
            const tmpPngPath = path.join(
              tmpDir,
              `${Date.now()}_${appName}_icon.png`,
            );

            const sipsCommand = `sips -s format png -z 32 32 "${iconPath}" --out "${tmpPngPath}"`;
            await execAsync(sipsCommand);

            if (fs.existsSync(tmpPngPath)) {
              const pngBuffer = fs.readFileSync(tmpPngPath);
              const base64Data = pngBuffer.toString("base64");
              const dataUrl = `data:image/png;base64,${base64Data}`;

              // Clean up temporary file
              fs.unlinkSync(tmpPngPath);

              return dataUrl;
            }
          } catch {
            continue;
          }
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

export async function getAppIcon(appName: string): Promise<{
  success: boolean;
  iconData?: string;
  error?: string;
}> {
  try {
    // Check cache first
    if (iconCache.has(appName)) {
      return {
        success: true,
        iconData: iconCache.get(appName)!,
      };
    }

    // Check builtin icon mapping
    if (BUILTIN_ICONS[appName]) {
      const iconData = BUILTIN_ICONS[appName];
      // Cache builtin icon
      iconCache.set(appName, iconData);
      return {
        success: true,
        iconData: iconData,
      };
    }

    // Not in cache, try loading from disk
    const iconData = await loadAppIconFromDisk(appName);
    if (iconData) {
      // Store in cache for future use
      iconCache.set(appName, iconData);
      return {
        success: true,
        iconData: iconData,
      };
    }

    return createErrorResult(`${ERROR_MESSAGES.ICON_NOT_FOUND}: ${appName}`);
  } catch (error) {
    console.error("Error getting app icon:", error);
    return createErrorResult(
      `${ERROR_MESSAGES.ICON_LOAD_FAILED}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
