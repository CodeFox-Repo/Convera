#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  AutomationError,
  ConveraDriver,
  type LaunchOptions,
} from "./driver.js";

const driver = new ConveraDriver();
const server = new McpServer(
  { name: "convera-automation", version: "1.0.0" },
  {
    instructions:
      "Atomic local automation for Convera Electron. Start with convera_session(action=launch), use convera_observe(action=snapshot) to discover current selectors, then perform one atomic action per convera_interact call. No predefined test specs or CI are involved.",
  },
);

let operationQueue: Promise<unknown> = Promise.resolve();

function serial<T>(operation: () => Promise<T>) {
  const result = operationQueue.then(operation, operation);
  operationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function textResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ ok: true, data }, null, 2),
      },
    ],
  };
}

function errorResult(error: unknown) {
  const normalized =
    error instanceof AutomationError
      ? {
          code: error.code,
          category: error.category,
          message: error.message,
          resolution: error.resolution,
          retryable: error.retryable,
          details:
            error.details instanceof Error
              ? error.details.message
              : error.details,
        }
      : {
          code: "UNEXPECTED_AUTOMATION_ERROR",
          category: "execution",
          message: error instanceof Error ? error.message : String(error),
          resolution:
            "Inspect .automation/logs, refresh the UI snapshot, and retry only if the application state is still valid.",
          retryable: false,
        };
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ ok: false, error: normalized }, null, 2),
      },
    ],
  };
}

async function run<T>(operation: () => Promise<T>) {
  try {
    return textResult(await serial(operation));
  } catch (error) {
    return errorResult(error);
  }
}

server.registerTool(
  "convera_session",
  {
    description:
      "Manage the persistent local Convera Electron session. Call launch first. Launch uses the normal local profile and test account; it does not create an isolated user-data directory. If the app bundle is missing, run `pnpm automation:prepare` once.",
    inputSchema: {
      action: z.enum(["launch", "status", "close", "switch_window"]),
      binary_path: z
        .string()
        .optional()
        .describe(
          "Optional packaged Convera executable. Omit to use .vite/build/main.js.",
        ),
      entry_point: z
        .string()
        .optional()
        .describe("Optional bundled Electron main.js path."),
      app_args: z
        .array(z.string())
        .optional()
        .describe("Arguments passed to Convera only when launching."),
      user_data_path: z
        .string()
        .optional()
        .describe(
          "Optional persistent Convera profile path. Defaults to the platform's normal Convera user-data directory.",
        ),
      window_handle: z
        .string()
        .optional()
        .describe("Exact handle for switch_window."),
      title_contains: z
        .string()
        .optional()
        .describe("Case-insensitive title fragment for switch_window."),
    },
    annotations: {
      title: "Manage Convera automation session",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async ({
    action,
    binary_path,
    entry_point,
    app_args,
    user_data_path,
    window_handle,
    title_contains,
  }) =>
    run(async () => {
      if (action === "launch") {
        const options: LaunchOptions = {
          binaryPath: binary_path,
          entryPoint: entry_point,
          appArgs: app_args,
          userDataPath: user_data_path,
        };
        return driver.launch(options);
      }
      if (action === "close") return driver.close();
      if (action === "switch_window") {
        if (!window_handle && !title_contains) {
          throw new AutomationError(
            "WINDOW_TARGET_REQUIRED",
            "configuration",
            "switch_window requires window_handle or title_contains.",
            "Call convera_observe action=windows, then pass one returned handle.",
          );
        }
        return driver.switchWindow(window_handle, title_contains);
      }
      return driver.status();
    }),
);

server.registerTool(
  "convera_observe",
  {
    description:
      "Read current Convera UI state without changing app data. snapshot returns interactive elements with usable WebdriverIO selectors; element inspects one selector; windows lists renderer windows; screenshot returns an image; logs returns the latest WDIO renderer log tail.",
    inputSchema: {
      action: z.enum(["snapshot", "element", "windows", "screenshot", "logs"]),
      selector: z
        .string()
        .optional()
        .describe(
          "Required for element; optional root scope for snapshot (default body).",
        ),
      max_elements: z.number().int().min(1).max(500).optional(),
      max_characters: z.number().int().min(100).max(100_000).optional(),
    },
    annotations: {
      title: "Observe Convera UI",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ action, selector, max_elements, max_characters }) => {
    if (action === "screenshot") {
      try {
        const screenshot = await serial(() => driver.screenshot());
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { ok: true, data: { filePath: screenshot.filePath } },
                null,
                2,
              ),
            },
            {
              type: "image" as const,
              data: screenshot.data,
              mimeType: "image/png",
            },
          ],
        };
      } catch (error) {
        return errorResult(error);
      }
    }
    return run(async () => {
      if (action === "snapshot") {
        return driver.snapshot(selector ?? "body", max_elements ?? 120);
      }
      if (action === "element") {
        if (!selector) {
          throw new AutomationError(
            "SELECTOR_REQUIRED",
            "configuration",
            "element observation requires selector.",
            "Pass a selector returned by action=snapshot.",
          );
        }
        return driver.inspectElement(selector);
      }
      if (action === "logs") {
        return driver.readLatestLog(max_characters ?? 20_000);
      }
      return driver.getWindows();
    });
  },
);

server.registerTool(
  "convera_interact",
  {
    description:
      "Perform exactly one atomic UI interaction in the active Convera renderer. Prefer selectors returned by convera_observe(snapshot). replace_text clears then types; append_text preserves existing content; press uses WebDriver key names such as Enter, Escape, Ctrl, Meta, ArrowDown.",
    inputSchema: {
      action: z.enum([
        "click",
        "double_click",
        "hover",
        "replace_text",
        "append_text",
        "clear",
        "press",
        "scroll",
        "select",
        "upload",
        "drag",
      ]),
      selector: z.string().optional(),
      value: z
        .string()
        .optional()
        .describe("Text, visible option text, or local upload path."),
      keys: z.union([z.string(), z.array(z.string())]).optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      target_selector: z.string().optional(),
    },
    annotations: {
      title: "Perform one Convera UI action",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async ({ action, selector, value, keys, x, y, target_selector }) =>
    run(async () => {
      const requireSelector = () => {
        if (!selector) {
          throw new AutomationError(
            "SELECTOR_REQUIRED",
            "configuration",
            `${action} requires selector.`,
            "Call convera_observe action=snapshot and pass a returned selector.",
          );
        }
        return selector;
      };
      const requireValue = () => {
        if (value === undefined) {
          throw new AutomationError(
            "VALUE_REQUIRED",
            "configuration",
            `${action} requires value.`,
            "Pass the text, visible option, or absolute file path in value.",
          );
        }
        return value;
      };

      switch (action) {
        case "click":
          return driver.click(requireSelector());
        case "double_click":
          return driver.click(requireSelector(), true);
        case "hover":
          return driver.hover(requireSelector());
        case "replace_text":
          return driver.replaceText(requireSelector(), requireValue());
        case "append_text":
          return driver.appendText(requireSelector(), requireValue());
        case "clear":
          return driver.clear(requireSelector());
        case "press":
          if (!keys) {
            throw new AutomationError(
              "KEYS_REQUIRED",
              "configuration",
              "press requires keys.",
              "Pass a WebDriver key name, text, or an array sequence in keys.",
            );
          }
          return driver.press(keys, selector);
        case "scroll":
          return driver.scroll(x ?? 0, y ?? 0, selector);
        case "select":
          return driver.select(requireSelector(), requireValue());
        case "upload":
          return driver.upload(requireSelector(), requireValue());
        case "drag":
          if (!target_selector) {
            throw new AutomationError(
              "TARGET_SELECTOR_REQUIRED",
              "configuration",
              "drag requires target_selector.",
              "Pass both selector and target_selector.",
            );
          }
          return driver.drag(requireSelector(), target_selector);
      }
    }),
);

server.registerTool(
  "convera_wait",
  {
    description:
      "Wait for one observable UI condition before the next atomic operation. hidden succeeds when an element is absent or not displayed. text_contains and value_equals require their matching expected field.",
    inputSchema: {
      condition: z.enum([
        "displayed",
        "hidden",
        "enabled",
        "disabled",
        "exists",
        "text_contains",
        "value_equals",
        "window_count",
      ]),
      selector: z.string().optional(),
      text: z.string().optional(),
      value: z.string().optional(),
      count: z.number().int().min(0).optional(),
      timeout_ms: z.number().int().min(1).max(120_000).optional(),
      interval_ms: z.number().int().min(20).max(10_000).optional(),
    },
    annotations: {
      title: "Wait for Convera UI state",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({
    condition,
    selector,
    text,
    value,
    count,
    timeout_ms,
    interval_ms,
  }) =>
    run(() => {
      if (condition === "window_count" && count === undefined) {
        throw new AutomationError(
          "COUNT_REQUIRED",
          "configuration",
          "window_count requires count.",
          "Pass the expected number of renderer windows in count.",
        );
      }
      if (condition === "text_contains" && text === undefined) {
        throw new AutomationError(
          "TEXT_REQUIRED",
          "configuration",
          "text_contains requires text.",
          "Pass the expected substring in text.",
        );
      }
      if (condition === "value_equals" && value === undefined) {
        throw new AutomationError(
          "VALUE_REQUIRED",
          "configuration",
          "value_equals requires value.",
          "Pass the expected exact value in value.",
        );
      }
      if (condition !== "window_count" && !selector) {
        throw new AutomationError(
          "SELECTOR_REQUIRED",
          "configuration",
          `${condition} requires selector.`,
          "Pass a selector returned by convera_observe action=snapshot.",
        );
      }
      return driver.waitFor(condition, {
        selector,
        text,
        value,
        count,
        timeoutMs: timeout_ms,
        intervalMs: interval_ms,
      });
    }),
);

server.registerTool(
  "convera_execute",
  {
    description:
      "Escape hatch for one controlled JavaScript operation when semantic UI tools are insufficient. script is an async function body: use `return ...`; args is available as an array. renderer has DOM/window access. main also exposes Electron as `electron` and normally requires the unpackaged .vite entry point.",
    inputSchema: {
      context: z.enum(["renderer", "main"]),
      script: z.string().min(1),
      args: z.array(z.unknown()).optional(),
    },
    annotations: {
      title: "Execute controlled Convera JavaScript",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async ({ context, script, args }) =>
    run(() =>
      context === "renderer"
        ? driver.executeRenderer(script, args)
        : driver.executeMain(script, args),
    ),
);

let shutdownPromise: Promise<void> | undefined;

async function shutdown() {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    await driver.close().catch((error) => {
      console.error("Failed to close Convera automation session:", error);
    });
    await server.close().catch(() => undefined);
  })();
  return shutdownPromise;
}

function shutdownAndExit(exitCode: number) {
  void shutdown().finally(() => {
    process.exit(exitCode);
  });
}

process.once("SIGINT", () => shutdownAndExit(130));
process.once("SIGTERM", () => shutdownAndExit(143));
process.stdin.once("end", () => shutdownAndExit(0));
process.stdin.once("close", () => shutdownAndExit(0));

/*
 * The MCP SDK's stdio server transport does not subscribe to stdin's end
 * event. Listening above is important when a client launches us through a
 * package-manager shim: otherwise the tsx child can survive after the client
 * closes its transport.
 */

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Convera atomic automation MCP server is running on stdio.");
}

main().catch((error) => {
  console.error("Convera automation server failed:", error);
  process.exitCode = 1;
});
