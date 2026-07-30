import {
  cleanupWdioSession,
  createElectronCapabilities,
  startWdioSession,
} from "@wdio/electron-service";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import {
  APP_ROOT,
  automationProfilePath,
  preparedChromedriverPath,
  RUNTIME_DIR,
  WORKSPACE_ROOT,
} from "./runtime.js";

/*
 * Node 26 exposes its built-in fetch dispatcher through Undici's global
 * dispatcher symbol. WebdriverIO 9 mistakes that wrapper for a compatible
 * custom dispatcher, which makes localhost WebDriver requests fail with
 * UND_ERR_INVALID_ARG. Install a real Undici dispatcher that also respects the
 * user's proxy and NO_PROXY settings.
 */
setGlobalDispatcher(new EnvHttpProxyAgent());

const DEFAULT_ENTRY_POINT = path.join(APP_ROOT, ".vite", "build", "main.js");
const LOG_DIR = path.join(RUNTIME_DIR, "logs");
const ARTIFACT_DIR = path.join(RUNTIME_DIR, "artifacts");
const APP_PACKAGE = JSON.parse(
  readFileSync(path.join(APP_ROOT, "package.json"), "utf8"),
) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function configuredElectronVersion() {
  const specifier =
    APP_PACKAGE.devDependencies?.electron ??
    APP_PACKAGE.dependencies?.electron ??
    "";
  const version = specifier.match(/\d+\.\d+\.\d+/)?.[0];
  if (!version) {
    throw new AutomationError(
      "ELECTRON_VERSION_NOT_FOUND",
      "configuration",
      "packages/app/package.json does not contain a concrete Electron version.",
      "Add Electron to the app dependencies or pass a compatible packaged binary.",
    );
  }
  return version;
}

function numericCapability(capabilities: unknown, name: string) {
  if (!capabilities || typeof capabilities !== "object") return undefined;
  const value = (capabilities as Record<string, unknown>)[name];
  return typeof value === "number" ? value : undefined;
}

function within<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Operation timed out after ${timeoutMs}ms.`)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function forceKill(pid: number | undefined) {
  if (pid === undefined) return;
  try {
    process.kill(pid, "SIGKILL");
  } catch (error) {
    if (
      !error ||
      typeof error !== "object" ||
      (error as NodeJS.ErrnoException).code !== "ESRCH"
    ) {
      throw error;
    }
  }
}

export type LaunchOptions = {
  binaryPath?: string;
  entryPoint?: string;
  appArgs?: string[];
  userDataPath?: string;
  profileId?: string;
  showWindow?: boolean;
};

export type UiElementSnapshot = {
  selector: string;
  tag: string;
  role: string | null;
  name: string;
  text: string;
  value: string | null;
  visible: boolean;
  enabled: boolean;
  focused: boolean;
  bounds: { x: number; y: number; width: number; height: number };
};

export class AutomationError extends Error {
  constructor(
    readonly code: string,
    readonly category:
      | "configuration"
      | "session"
      | "selector"
      | "timeout"
      | "execution",
    message: string,
    readonly resolution: string,
    readonly retryable = false,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AutomationError";
  }
}

export class ConveraDriver {
  private browser?: WebdriverIO.Browser;
  private processIds?: {
    driver?: number;
    electron?: number;
  };
  private launchedWith?: {
    kind: "binary" | "entry-point";
    path: string;
    userDataPath: string;
  };

  async launch(options: LaunchOptions = {}) {
    if (this.browser) return this.status();

    await mkdir(LOG_DIR, { recursive: true });
    await mkdir(ARTIFACT_DIR, { recursive: true });

    const binaryPath = options.binaryPath
      ? path.resolve(options.binaryPath)
      : process.env.CONVERA_AUTOMATION_APP_BINARY
        ? path.resolve(process.env.CONVERA_AUTOMATION_APP_BINARY)
        : undefined;
    const entryPoint = options.entryPoint
      ? path.resolve(options.entryPoint)
      : process.env.CONVERA_AUTOMATION_ENTRY_POINT
        ? path.resolve(process.env.CONVERA_AUTOMATION_ENTRY_POINT)
        : DEFAULT_ENTRY_POINT;

    if (binaryPath && !existsSync(binaryPath)) {
      throw new AutomationError(
        "APP_BINARY_NOT_FOUND",
        "configuration",
        `Electron binary does not exist: ${binaryPath}`,
        "Pass an existing app binary path or run `pnpm automation:prepare` and omit binary_path.",
      );
    }
    if (!binaryPath && !existsSync(entryPoint)) {
      throw new AutomationError(
        "APP_NOT_BUILT",
        "configuration",
        `Bundled Electron entry point does not exist: ${entryPoint}`,
        "Run `pnpm automation:prepare` once, then call convera_session with action=launch again.",
      );
    }
    const chromedriverPath = preparedChromedriverPath();
    if (!existsSync(chromedriverPath)) {
      throw new AutomationError(
        "CHROMEDRIVER_NOT_PREPARED",
        "configuration",
        `Matching Chromedriver does not exist: ${chromedriverPath}`,
        "Run `pnpm automation:prepare`, then retry launch.",
      );
    }

    const userDataPath = path.resolve(
      options.userDataPath ??
        process.env.CONVERA_AUTOMATION_USER_DATA ??
        automationProfilePath(
          options.profileId ??
            process.env.CONVERA_AUTOMATION_PROFILE_ID ??
            `agent-${process.pid}`,
        ),
    );
    await mkdir(userDataPath, { recursive: true });
    const appArgs = [...(options.appArgs ?? [])];
    if (
      options.showWindow !== true &&
      !appArgs.includes("--convera-automation-background")
    ) {
      appArgs.push("--convera-automation-background");
    }
    if (!appArgs.some((argument) => argument.startsWith("--user-data-dir="))) {
      appArgs.push(`--user-data-dir=${userDataPath}`);
    }

    const launchTarget = binaryPath
      ? { appBinaryPath: binaryPath }
      : { appEntryPoint: entryPoint };
    const capabilities = Object.assign(
      createElectronCapabilities({
        ...launchTarget,
        appArgs,
        captureMainProcessLogs: false,
        captureRendererLogs: true,
        rendererLogLevel: "info",
        logDir: LOG_DIR,
      }),
      {
        browserVersion: configuredElectronVersion(),
        "wdio:chromedriverOptions": { binary: chromedriverPath },
      },
    );

    try {
      const browser = await startWdioSession([capabilities], {
        rootDir: WORKSPACE_ROOT,
      });
      this.browser = browser;
      this.processIds = {
        driver: numericCapability(browser.capabilities, "wdio:driverPID"),
        electron: await browser.electron
          .execute(() => process.pid)
          .then((value) => (typeof value === "number" ? value : undefined))
          .catch(() => undefined),
      };
      this.launchedWith = {
        kind: binaryPath ? "binary" : "entry-point",
        path: binaryPath ?? entryPoint,
        userDataPath,
      };
      await browser.waitUntil(
        async () => (await browser.getWindowHandles()).length > 0,
        {
          timeout: 20_000,
          interval: 250,
          timeoutMsg:
            "Convera did not open a renderer window within 20 seconds.",
        },
      );
      return this.status();
    } catch (error) {
      await this.close().catch(() => undefined);
      throw new AutomationError(
        "SESSION_START_FAILED",
        "session",
        error instanceof Error ? error.message : String(error),
        "Check `pnpm automation:prepare`, the Electron/Chromedriver versions, and .automation/logs, then retry launch.",
        true,
        error,
      );
    }
  }

  async close() {
    if (!this.browser) return { running: false };

    const browser = this.browser;
    const processIds = this.processIds;
    this.browser = undefined;
    this.processIds = undefined;
    this.launchedWith = undefined;
    try {
      let operationError: unknown;
      try {
        await within(
          browser.electron.execute((electron) => {
            setTimeout(() => electron.app.quit(), 0);
            return true;
          }),
          2_000,
        ).catch((error) => {
          operationError = error;
        });
        await within(browser.deleteSession(), 3_000).catch((error) => {
          operationError ??= error;
        });
      } finally {
        forceKill(processIds?.electron);
        forceKill(processIds?.driver);
        await within(cleanupWdioSession(browser), 2_000).catch(() => undefined);
      }
      if (
        operationError &&
        processIds?.electron === undefined &&
        processIds?.driver === undefined
      ) {
        throw operationError;
      }
    } catch (error) {
      throw new AutomationError(
        "SESSION_CLOSE_FAILED",
        "session",
        error instanceof Error ? error.message : String(error),
        "The driver state was cleared. Check for a remaining Convera process and close it manually if necessary.",
        false,
        error,
      );
    }
    return { running: false };
  }

  async status() {
    if (!this.browser) {
      return { running: false, launchTarget: null, windows: [] };
    }
    return {
      running: true,
      launchTarget: this.launchedWith,
      sessionId: this.browser.sessionId,
      windows: await this.getWindows(),
    };
  }

  async getWindows() {
    const browser = this.requireBrowser();
    const current = await browser.getWindowHandle();
    const handles = await browser.getWindowHandles();
    const windows: Array<{
      handle: string;
      title: string;
      url: string;
      active: boolean;
    }> = [];

    for (const handle of handles) {
      await browser.switchToWindow(handle);
      windows.push({
        handle,
        title: await browser.getTitle(),
        url: await browser.getUrl(),
        active: handle === current,
      });
    }
    if (handles.includes(current)) await browser.switchToWindow(current);
    return windows;
  }

  async switchWindow(handle?: string, titleContains?: string) {
    const browser = this.requireBrowser();
    const windows = await this.getWindows();
    const target = handle
      ? windows.find((window) => window.handle === handle)
      : windows.find((window) =>
          titleContains
            ? window.title.toLowerCase().includes(titleContains.toLowerCase())
            : false,
        );
    if (!target) {
      throw new AutomationError(
        "WINDOW_NOT_FOUND",
        "selector",
        `No window matched ${handle ? `handle ${handle}` : `title containing "${titleContains ?? ""}"`}.`,
        "Call convera_observe with action=windows and use a returned handle or title.",
      );
    }
    await browser.switchToWindow(target.handle);
    return { ...target, active: true };
  }

  async snapshot(scope = "body", maxElements = 120) {
    const browser = this.requireBrowser();
    return browser.execute(
      (scopeSelector, limit): UiElementSnapshot[] => {
        const scopeElement = document.querySelector(scopeSelector);
        if (!scopeElement) {
          throw new Error(`Scope selector did not match: ${scopeSelector}`);
        }

        const escapeAttribute = (value: string) =>
          value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        const cssEscape = (value: string) =>
          globalThis.CSS?.escape
            ? globalThis.CSS.escape(value)
            : value.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
        const selectorFor = (element: Element) => {
          const testId = element.getAttribute("data-testid");
          if (testId) return `[data-testid="${escapeAttribute(testId)}"]`;
          if (element.id) return `#${cssEscape(element.id)}`;
          for (const attribute of [
            "aria-label",
            "placeholder",
            "name",
          ] as const) {
            const value = element.getAttribute(attribute);
            if (value) {
              return `${element.tagName.toLowerCase()}[${attribute}="${escapeAttribute(value)}"]`;
            }
          }

          const segments: string[] = [];
          let current: Element | null = element;
          while (current && current !== document.documentElement) {
            let segment = current.tagName.toLowerCase();
            const parentElement: Element | null = current.parentElement;
            if (parentElement) {
              const sameTag: Element[] = Array.from(
                parentElement.children,
              ).filter((child: Element) => child.tagName === current?.tagName);
              if (sameTag.length > 1) {
                segment += `:nth-of-type(${sameTag.indexOf(current) + 1})`;
              }
            }
            segments.unshift(segment);
            current = parentElement;
          }
          return segments.join(" > ");
        };
        const accessibleName = (element: Element) => {
          const ariaLabel = element.getAttribute("aria-label");
          if (ariaLabel) return ariaLabel.trim();
          const labelledBy = element.getAttribute("aria-labelledby");
          if (labelledBy) {
            const label = document.getElementById(labelledBy);
            if (label?.textContent) return label.textContent.trim();
          }
          if (element instanceof HTMLInputElement && element.id) {
            const label = document.querySelector(
              `label[for="${escapeAttribute(element.id)}"]`,
            );
            if (label?.textContent) return label.textContent.trim();
          }
          return (
            element.getAttribute("title") ??
            element.getAttribute("alt") ??
            element.getAttribute("placeholder") ??
            element.textContent ??
            ""
          ).trim();
        };
        const isVisible = (element: Element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity) !== 0 &&
            rect.width > 0 &&
            rect.height > 0
          );
        };
        const interactiveSelector = [
          "button",
          "input",
          "textarea",
          "select",
          "a[href]",
          "[role]",
          '[contenteditable="true"]',
          '[tabindex]:not([tabindex="-1"])',
        ].join(",");

        return Array.from(scopeElement.querySelectorAll(interactiveSelector))
          .slice(0, Math.max(1, limit))
          .map((element) => {
            const inputElement = element as HTMLInputElement;
            const rect = element.getBoundingClientRect();
            const disabled =
              "disabled" in inputElement
                ? Boolean(inputElement.disabled)
                : element.getAttribute("aria-disabled") === "true";
            return {
              selector: selectorFor(element),
              tag: element.tagName.toLowerCase(),
              role: element.getAttribute("role"),
              name: accessibleName(element).slice(0, 300),
              text: (element.textContent ?? "").trim().slice(0, 300),
              value:
                "value" in inputElement ? String(inputElement.value) : null,
              visible: isVisible(element),
              enabled: !disabled,
              focused: document.activeElement === element,
              bounds: {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
              },
            };
          });
      },
      scope,
      maxElements,
    );
  }

  async inspectElement(selector: string) {
    const browser = this.requireBrowser();
    const element = await browser.$(selector);
    if (!(await element.isExisting())) throw this.selectorError(selector);

    return {
      selector,
      tag: await element.getTagName(),
      text: await element.getText(),
      value: await element.getValue().catch(() => null),
      displayed: await element.isDisplayed(),
      enabled: await element.isEnabled(),
      clickable: await element.isClickable().catch(() => false),
      attributes: await browser.execute((node) => {
        const elementNode = node as unknown as Element;
        return Object.fromEntries(
          Array.from(elementNode.attributes).map((attribute) => [
            attribute.name,
            attribute.value,
          ]),
        );
      }, element),
    };
  }

  async screenshot() {
    const browser = this.requireBrowser();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = path.join(ARTIFACT_DIR, `convera-${timestamp}.png`);
    const data = await browser.takeScreenshot();
    await writeFile(filePath, Buffer.from(data, "base64"));
    return { filePath, data };
  }

  async readLatestLog(maxCharacters = 20_000) {
    await mkdir(LOG_DIR, { recursive: true });
    const files = (await readdir(LOG_DIR))
      .filter((file) => file.startsWith("wdio-") && file.endsWith(".log"))
      .sort();
    const latest = files.at(-1);
    if (!latest) return { filePath: null, text: "" };

    const filePath = path.join(LOG_DIR, latest);
    const text = await readFile(filePath, "utf8");
    return { filePath, text: text.slice(-Math.max(1, maxCharacters)) };
  }

  async click(selector: string, double = false) {
    const element = await this.readyElement(selector, true);
    if (double) await element.doubleClick();
    else await element.click();
    return this.inspectElement(selector);
  }

  async hover(selector: string) {
    const element = await this.readyElement(selector);
    await element.moveTo();
    return this.inspectElement(selector);
  }

  async replaceText(selector: string, value: string) {
    const element = await this.readyElement(selector);
    await element.setValue(value);
    return this.inspectElement(selector);
  }

  async appendText(selector: string, value: string) {
    const element = await this.readyElement(selector);
    await element.addValue(value);
    return this.inspectElement(selector);
  }

  async clear(selector: string) {
    const element = await this.readyElement(selector);
    await element.clearValue();
    return this.inspectElement(selector);
  }

  async press(keys: string | string[], selector?: string) {
    const browser = this.requireBrowser();
    if (selector) {
      const element = await this.readyElement(selector);
      await element.click();
    }
    await browser.keys(keys);
    return {
      keys: Array.isArray(keys) ? keys : [keys],
      activeElement: await browser.execute(() => {
        const element = document.activeElement as HTMLElement | null;
        return element
          ? {
              tag: element.tagName.toLowerCase(),
              id: element.id || null,
              ariaLabel: element.getAttribute("aria-label"),
            }
          : null;
      }),
    };
  }

  async scroll(x = 0, y = 0, selector?: string) {
    const browser = this.requireBrowser();
    if (selector) {
      const element = await this.readyElement(selector);
      await element.scrollIntoView();
      return this.inspectElement(selector);
    }
    await browser.scroll(x, y);
    return browser.execute(() => ({ x: window.scrollX, y: window.scrollY }));
  }

  async select(selector: string, visibleText: string) {
    const element = await this.readyElement(selector);
    await element.selectByVisibleText(visibleText);
    return this.inspectElement(selector);
  }

  async upload(selector: string, filePath: string) {
    const browser = this.requireBrowser();
    const element = await this.readyElement(selector);
    const remotePath = await browser.uploadFile(path.resolve(filePath));
    await element.setValue(remotePath);
    return this.inspectElement(selector);
  }

  async drag(selector: string, targetSelector: string) {
    const source = await this.readyElement(selector);
    const target = await this.readyElement(targetSelector);
    await source.dragAndDrop(target);
    return {
      source: await this.inspectElement(selector),
      target: await this.inspectElement(targetSelector),
    };
  }

  async waitFor(
    condition:
      | "displayed"
      | "hidden"
      | "enabled"
      | "disabled"
      | "exists"
      | "text_contains"
      | "value_equals"
      | "window_count",
    options: {
      selector?: string;
      text?: string;
      value?: string;
      count?: number;
      timeoutMs?: number;
      intervalMs?: number;
    },
  ) {
    const browser = this.requireBrowser();
    const timeout = options.timeoutMs ?? 10_000;
    const interval = options.intervalMs ?? 200;
    let observed: unknown;

    try {
      const matched = await browser.waitUntil(
        async () => {
          if (condition === "window_count") {
            observed = (await browser.getWindowHandles()).length;
            return observed === options.count;
          }
          if (!options.selector) {
            throw new Error(`selector is required for condition=${condition}`);
          }
          const element = await browser.$(options.selector);
          const exists = await element.isExisting();
          if (condition === "exists") {
            observed = exists;
            return exists;
          }
          if (condition === "hidden") {
            observed = exists ? await element.isDisplayed() : false;
            return !observed;
          }
          if (!exists) {
            observed = null;
            return false;
          }
          if (condition === "displayed") {
            observed = await element.isDisplayed();
            return observed;
          }
          if (condition === "enabled" || condition === "disabled") {
            observed = await element.isEnabled();
            return condition === "enabled" ? observed : !observed;
          }
          if (condition === "text_contains") {
            observed = await element.getText();
            return String(observed).includes(options.text ?? "");
          }
          observed = await element.getValue();
          return observed === options.value;
        },
        {
          timeout,
          interval,
          timeoutMsg: `Condition ${condition} was not met within ${timeout}ms. Last observed value: ${JSON.stringify(observed)}`,
        },
      );
      return { matched, condition, observed };
    } catch (error) {
      throw new AutomationError(
        "WAIT_TIMEOUT",
        "timeout",
        `Condition ${condition} was not met within ${timeout}ms.`,
        "Observe the current UI state, correct the selector or expected value, then wait again.",
        true,
        {
          observed,
          cause: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  async executeRenderer(script: string, args: unknown[] = []) {
    const browser = this.requireBrowser();
    return browser.execute(
      (source, scriptArgs) => {
        const execute = new Function(
          "args",
          `"use strict"; return (async () => { ${source}\n })();`,
        ) as (input: unknown[]) => Promise<unknown>;
        return execute(scriptArgs);
      },
      script,
      args,
    );
  }

  async executeMain(script: string, args: unknown[] = []) {
    const browser = this.requireBrowser();
    try {
      return await browser.electron.execute(
        (electron, source, scriptArgs) => {
          const execute = new Function(
            "electron",
            "args",
            `"use strict"; return (async () => { ${source}\n })();`,
          ) as (
            electronApi: typeof electron,
            input: unknown[],
          ) => Promise<unknown>;
          return execute(electron, scriptArgs);
        },
        script,
        args,
      );
    } catch (error) {
      throw new AutomationError(
        "MAIN_PROCESS_EXECUTION_FAILED",
        "execution",
        error instanceof Error ? error.message : String(error),
        "Use context=renderer for DOM work. For main-process access, launch the unpackaged .vite entry point; production packages disable Electron inspect arguments.",
        false,
        error,
      );
    }
  }

  private requireBrowser() {
    if (!this.browser) {
      throw new AutomationError(
        "NO_ACTIVE_SESSION",
        "session",
        "Convera is not connected.",
        "Call convera_session with action=launch before using this tool.",
      );
    }
    return this.browser;
  }

  private async readyElement(selector: string, clickable = false) {
    const browser = this.requireBrowser();
    const element = await browser.$(selector);
    try {
      await element.waitForExist({ timeout: 10_000 });
      await element.waitForDisplayed({ timeout: 10_000 });
      if (clickable) {
        await browser.waitUntil(() => element.isClickable(), {
          timeout: 10_000,
          interval: 200,
          timeoutMsg: `Element is not clickable: ${selector}`,
        });
      }
      return element;
    } catch (error) {
      throw new AutomationError(
        "ELEMENT_NOT_READY",
        "selector",
        `Element is not ready for interaction: ${selector}`,
        "Call convera_observe action=snapshot to refresh selectors, or convera_wait for the expected state.",
        true,
        error,
      );
    }
  }

  private selectorError(selector: string) {
    return new AutomationError(
      "ELEMENT_NOT_FOUND",
      "selector",
      `Selector did not match an element: ${selector}`,
      "Call convera_observe action=snapshot to get current stable selector suggestions.",
      true,
    );
  }
}
