import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { tool } from "ai";
import { z } from "zod";

type MouseButton = "left" | "right" | "middle";
type KeyModifier = "alt" | "command" | "control" | "shift";

export interface ComputerBitmap {
  width: number;
  height: number;
  image: Buffer;
  byteWidth: number;
  bitsPerPixel: number;
  bytesPerPixel: number;
}

export interface ComputerRobot {
  screen: {
    capture(
      x?: number,
      y?: number,
      width?: number,
      height?: number,
    ): ComputerBitmap;
  };
  getScreenSize(): { width: number; height: number };
  getMousePos(): { x: number; y: number };
  moveMouse(x: number, y: number): void;
  moveMouseSmooth(x: number, y: number): void;
  mouseClick(button?: MouseButton, double?: boolean): void;
  mouseToggle(state: "up" | "down", button?: MouseButton): void;
  scrollMouse(x: number, y: number): void;
  keyTap(key: string, modifier?: KeyModifier | KeyModifier[]): void;
  typeString(text: string): void;
}

export interface ComputerControlDependencies {
  getRobot(): Promise<ComputerRobot>;
  bitmapToPng(bitmap: ComputerBitmap): Promise<Buffer>;
  getPermissions(): Promise<{
    accessibility: boolean | "unsupported";
    screenRecording: string | "unsupported";
  }>;
  wait(durationMs: number): Promise<void>;
}

const coordinateSchema = z
  .tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])
  .describe("Absolute [x, y] coordinates in the screenshot coordinate space");

const computerControlInput = z.object({
  action: z
    .enum([
      "screenshot",
      "mouse_move",
      "left_click",
      "right_click",
      "middle_click",
      "double_click",
      "left_click_drag",
      "type",
      "key",
      "scroll",
      "wait",
    ])
    .describe("One atomic computer action to execute"),
  coordinate: coordinateSchema.optional(),
  start_coordinate: coordinateSchema
    .optional()
    .describe("Drag start [x, y]; required for left_click_drag"),
  text: z
    .string()
    .max(20000)
    .optional()
    .describe("Text to type; required for the type action"),
  key: z
    .string()
    .max(100)
    .optional()
    .describe("Key or shortcut such as ENTER, CMD+L, or CTRL+SHIFT+P"),
  scroll_x: z
    .number()
    .int()
    .min(-10000)
    .max(10000)
    .optional()
    .describe("Horizontal scroll amount; negative scrolls left"),
  scroll_y: z
    .number()
    .int()
    .min(-10000)
    .max(10000)
    .optional()
    .describe("Vertical scroll amount; negative scrolls down"),
  duration_ms: z
    .number()
    .int()
    .min(0)
    .max(10000)
    .optional()
    .describe("Wait duration in milliseconds; required for wait"),
});

type ComputerControlInput = z.infer<typeof computerControlInput>;

const actionRequirements: Partial<
  Record<ComputerControlInput["action"], Array<keyof ComputerControlInput>>
> = {
  mouse_move: ["coordinate"],
  left_click: ["coordinate"],
  right_click: ["coordinate"],
  middle_click: ["coordinate"],
  double_click: ["coordinate"],
  left_click_drag: ["start_coordinate", "coordinate"],
  type: ["text"],
  key: ["key"],
  wait: ["duration_ms"],
};

function validateActionInput(input: ComputerControlInput): void {
  for (const field of actionRequirements[input.action] ?? []) {
    if (input[field] === undefined) {
      throw new Error(
        `INVALID_COMPUTER_ACTION: '${input.action}' requires '${field}'. Add the missing field and retry.`,
      );
    }
  }

  if (
    input.action === "scroll" &&
    input.scroll_x === undefined &&
    input.scroll_y === undefined
  ) {
    throw new Error(
      "INVALID_COMPUTER_ACTION: 'scroll' requires scroll_x or scroll_y. Add a non-zero scroll amount and retry.",
    );
  }
}

function validateCoordinate(
  coordinate: [number, number],
  screenSize: { width: number; height: number },
): void {
  const [x, y] = coordinate;
  if (x >= screenSize.width || y >= screenSize.height) {
    throw new Error(
      `COORDINATE_OUT_OF_BOUNDS: [${x}, ${y}] is outside ${screenSize.width}x${screenSize.height}. Take a new screenshot and retry with coordinates inside it.`,
    );
  }
}

function parseKeyShortcut(value: string): {
  key: string;
  modifiers?: KeyModifier[];
} {
  const parts = value
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  const key = parts.pop();
  if (!key) {
    throw new Error(
      "INVALID_KEY: provide a key such as ENTER, CMD+L, or CTRL+SHIFT+P.",
    );
  }

  const aliases: Record<string, KeyModifier> = {
    alt: "alt",
    option: "alt",
    cmd: "command",
    command: "command",
    meta: "command",
    ctrl: "control",
    control: "control",
    shift: "shift",
  };
  const modifiers = parts.map((part) => aliases[part]);
  const invalidModifier = parts.find((_, index) => !modifiers[index]);
  if (invalidModifier) {
    throw new Error(
      `INVALID_KEY_MODIFIER: '${invalidModifier}' is unsupported. Use CMD, CTRL, ALT/OPTION, or SHIFT.`,
    );
  }

  return {
    key,
    modifiers: modifiers.length ? modifiers : undefined,
  };
}

function textResult(
  input: ComputerControlInput,
  robot: ComputerRobot,
): CallToolResult {
  const screen = robot.getScreenSize();
  const cursor = robot.getMousePos();
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          action: input.action,
          screen,
          cursor,
        }),
      },
    ],
  };
}

async function screenshotResult(
  robot: ComputerRobot,
  bitmapToPng: ComputerControlDependencies["bitmapToPng"],
): Promise<CallToolResult> {
  const bitmap = robot.screen.capture();
  const png = await bitmapToPng(bitmap);
  const cursor = robot.getMousePos();
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          action: "screenshot",
          screen: { width: bitmap.width, height: bitmap.height },
          cursor,
          coordinateSpace: "Screenshot top-left is [0, 0].",
        }),
      },
      {
        type: "image",
        data: png.toString("base64"),
        mimeType: "image/png",
      },
    ],
  };
}

function assertPermission(
  action: ComputerControlInput["action"],
  permissions: Awaited<
    ReturnType<ComputerControlDependencies["getPermissions"]>
  >,
): void {
  if (action === "screenshot") {
    if (
      permissions.screenRecording !== "granted" &&
      permissions.screenRecording !== "unsupported"
    ) {
      throw new Error(
        `SCREEN_RECORDING_PERMISSION_REQUIRED: current status is '${permissions.screenRecording}'. Grant Convera Screen Recording permission in system settings, restart Convera, and retry.`,
      );
    }
    return;
  }

  if (action !== "wait" && permissions.accessibility === false) {
    throw new Error(
      "ACCESSIBILITY_PERMISSION_REQUIRED: grant Convera Accessibility permission in system settings, restart Convera, and retry.",
    );
  }
}

async function defaultDependencies(): Promise<ComputerControlDependencies> {
  return {
    getRobot: async () =>
      (await import("../../shared/robot.js"))
        .default as unknown as ComputerRobot,
    bitmapToPng: async (bitmap) => {
      if (
        bitmap.bitsPerPixel !== 32 ||
        bitmap.bytesPerPixel !== 4 ||
        bitmap.byteWidth !== bitmap.width * 4
      ) {
        throw new Error(
          `UNSUPPORTED_SCREEN_BITMAP: expected packed 32-bit pixels, received ${bitmap.bitsPerPixel}-bit with byte width ${bitmap.byteWidth}.`,
        );
      }
      const { nativeImage } = await import("electron");
      const image = nativeImage.createFromBitmap(Buffer.from(bitmap.image), {
        width: bitmap.width,
        height: bitmap.height,
        scaleFactor: 1,
      });
      const png = image.toPNG();
      if (png.length === 0) {
        throw new Error(
          "SCREENSHOT_ENCODING_FAILED: Electron could not encode the captured display. Retry after checking Screen Recording permission.",
        );
      }
      return png;
    },
    getPermissions: async () => {
      if (process.platform !== "darwin") {
        return {
          accessibility: "unsupported",
          screenRecording: "unsupported",
        };
      }
      const { systemPreferences } = await import("electron");
      return {
        accessibility: systemPreferences.isTrustedAccessibilityClient(false),
        screenRecording: systemPreferences.getMediaAccessStatus("screen"),
      };
    },
    wait: (durationMs) =>
      new Promise((resolve) => setTimeout(resolve, durationMs)),
  };
}

export function createComputerControl(
  dependencies?: ComputerControlDependencies,
) {
  return tool({
    description:
      "Observe and control the user's real desktop with one atomic action. Use screenshot first and again after actions when visual confirmation is needed. Coordinates use the latest screenshot's top-left as [0, 0]. Supported actions are screenshot, mouse_move, left_click, right_click, middle_click, double_click, left_click_drag, type, key, scroll, and wait. Returns JSON state for actions and an MCP image plus screen dimensions for screenshots. Desktop contents may be sensitive and every call requires user approval.",
    inputSchema: computerControlInput,
    execute: async (input) => {
      validateActionInput(input);
      const resolvedDependencies =
        dependencies ?? (await defaultDependencies());
      const permissions = await resolvedDependencies.getPermissions();
      assertPermission(input.action, permissions);
      const robot = await resolvedDependencies.getRobot();

      if (input.action === "screenshot") {
        return screenshotResult(robot, resolvedDependencies.bitmapToPng);
      }

      const screenSize = robot.getScreenSize();
      if (input.coordinate) {
        validateCoordinate(input.coordinate, screenSize);
      }
      if (input.start_coordinate) {
        validateCoordinate(input.start_coordinate, screenSize);
      }

      switch (input.action) {
        case "mouse_move":
          robot.moveMouse(...input.coordinate!);
          break;
        case "left_click":
        case "right_click":
        case "middle_click":
        case "double_click": {
          robot.moveMouse(...input.coordinate!);
          const button =
            input.action === "right_click"
              ? "right"
              : input.action === "middle_click"
                ? "middle"
                : "left";
          robot.mouseClick(button, input.action === "double_click");
          break;
        }
        case "left_click_drag":
          robot.moveMouse(...input.start_coordinate!);
          robot.mouseToggle("down", "left");
          try {
            robot.moveMouseSmooth(...input.coordinate!);
          } finally {
            robot.mouseToggle("up", "left");
          }
          break;
        case "type":
          robot.typeString(input.text!);
          break;
        case "key": {
          const shortcut = parseKeyShortcut(input.key!);
          robot.keyTap(shortcut.key, shortcut.modifiers);
          break;
        }
        case "scroll":
          robot.scrollMouse(input.scroll_x ?? 0, input.scroll_y ?? 0);
          break;
        case "wait":
          await resolvedDependencies.wait(input.duration_ms!);
          break;
      }

      return textResult(input, robot);
    },
  });
}

export const computerControl = createComputerControl();
