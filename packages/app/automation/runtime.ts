import { existsSync } from "node:fs";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const AUTOMATION_DIR = path.dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = path.resolve(AUTOMATION_DIR, "..");
export const WORKSPACE_ROOT = path.resolve(APP_ROOT, "..", "..");
export const RUNTIME_DIR = path.join(APP_ROOT, ".automation");

const require = createRequire(import.meta.url);

export function normalizeElectronBinaryPath(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Electron did not provide an executable path.");
  }
  return value.trim();
}

export function electronBinaryPath() {
  return normalizeElectronBinaryPath(require("electron"));
}

export function automationProfilePath(profileId: string) {
  const normalized = profileId
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  if (!normalized) {
    throw new Error("Automation profile id must contain a letter or number.");
  }
  return path.join(RUNTIME_DIR, "profiles", normalized);
}

export function chromiumVersion() {
  const result = spawnSync(
    electronBinaryPath(),
    ["-p", "process.versions.chrome"],
    {
      encoding: "utf8",
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    },
  );
  const version = result.stdout?.trim() ?? "";
  if (result.status !== 0 || !/^\d+\.\d+\.\d+\.\d+$/.test(version)) {
    const detail =
      result.error?.message || result.stderr?.trim() || "unknown error";
    throw new Error(`Could not read Chromium version from Electron: ${detail}`);
  }
  return version;
}

export function chromedriverPlatform() {
  if (process.platform === "darwin") {
    return process.arch === "arm64" ? "mac-arm64" : "mac-x64";
  }
  if (process.platform === "linux") return "linux64";
  if (process.platform === "win32") {
    return process.arch === "ia32" ? "win32" : "win64";
  }
  throw new Error(
    `Chromedriver preparation is not supported on ${process.platform}/${process.arch}.`,
  );
}

export function preparedChromedriverPath(version = chromiumVersion()) {
  const platform = chromedriverPlatform();
  const executable =
    process.platform === "win32" ? "chromedriver.exe" : "chromedriver";
  return path.join(
    RUNTIME_DIR,
    "drivers",
    version,
    `chromedriver-${platform}`,
    executable,
  );
}

export async function prepareChromedriver() {
  const version = chromiumVersion();
  const platform = chromedriverPlatform();
  const driverPath = preparedChromedriverPath(version);
  if (existsSync(driverPath))
    return { version, platform, driverPath, cached: true };

  const driverRoot = path.join(RUNTIME_DIR, "drivers", version);
  const zipPath = path.join(driverRoot, `chromedriver-${platform}.zip`);
  await mkdir(driverRoot, { recursive: true });

  const url = `https://storage.googleapis.com/chrome-for-testing-public/${version}/${platform}/chromedriver-${platform}.zip`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Chromedriver download failed with HTTP ${response.status}: ${url}`,
    );
  }
  await writeFile(zipPath, Buffer.from(await response.arrayBuffer()));

  if (process.platform === "win32") {
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Expand-Archive -Force -LiteralPath $env:CONVERA_DRIVER_ZIP -DestinationPath $env:CONVERA_DRIVER_ROOT",
      ],
      {
        env: {
          ...process.env,
          CONVERA_DRIVER_ZIP: zipPath,
          CONVERA_DRIVER_ROOT: driverRoot,
        },
        stdio: "inherit",
      },
    );
  } else {
    execFileSync("unzip", ["-o", zipPath, "-d", driverRoot], {
      stdio: "inherit",
    });
    await chmod(driverPath, 0o755);
  }

  if (!existsSync(driverPath)) {
    throw new Error(`Chromedriver extraction did not create ${driverPath}`);
  }
  return { version, platform, driverPath, cached: false };
}
