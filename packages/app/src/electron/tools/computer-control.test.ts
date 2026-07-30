import { describe, expect, it, vi } from "vitest";
import {
  createComputerControl,
  type ComputerBitmap,
  type ComputerControlDependencies,
  type ComputerRobot,
} from "./computer-control";

function testRig(
  permissionOverrides: Partial<
    Awaited<ReturnType<ComputerControlDependencies["getPermissions"]>>
  > = {},
) {
  const bitmap: ComputerBitmap = {
    width: 1440,
    height: 900,
    image: Buffer.alloc(1440 * 900 * 4),
    byteWidth: 1440 * 4,
    bitsPerPixel: 32,
    bytesPerPixel: 4,
  };
  const robot: ComputerRobot = {
    screen: { capture: vi.fn(() => bitmap) },
    getScreenSize: vi.fn(() => ({ width: 1440, height: 900 })),
    getMousePos: vi.fn(() => ({ x: 100, y: 200 })),
    moveMouse: vi.fn(),
    moveMouseSmooth: vi.fn(),
    mouseClick: vi.fn(),
    mouseToggle: vi.fn(),
    scrollMouse: vi.fn(),
    keyTap: vi.fn(),
    typeString: vi.fn(),
  };
  const dependencies: ComputerControlDependencies = {
    getRobot: vi.fn(async () => robot),
    bitmapToPng: vi.fn(async () => Buffer.from("png")),
    getPermissions: vi.fn(async () => ({
      accessibility: true,
      screenRecording: "granted",
      ...permissionOverrides,
    })),
    wait: vi.fn(async () => undefined),
  };
  const computer = createComputerControl(dependencies);
  const execute = (input: Record<string, unknown>) =>
    computer.execute!(input, {
      toolCallId: "computer-control-test",
      messages: [],
    });

  return { bitmap, computer, dependencies, execute, robot };
}

describe("computer_control", () => {
  it("returns screenshots as MCP image content with coordinate metadata", async () => {
    const { execute } = testRig();

    await expect(execute({ action: "screenshot" })).resolves.toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            action: "screenshot",
            screen: { width: 1440, height: 900 },
            cursor: { x: 100, y: 200 },
            coordinateSpace: "Screenshot top-left is [0, 0].",
          }),
        },
        {
          type: "image",
          data: Buffer.from("png").toString("base64"),
          mimeType: "image/png",
        },
      ],
    });
  });

  it("executes clicks at validated screenshot coordinates", async () => {
    const { execute, robot } = testRig();

    await execute({ action: "double_click", coordinate: [320, 240] });

    expect(robot.moveMouse).toHaveBeenCalledWith(320, 240);
    expect(robot.mouseClick).toHaveBeenCalledWith("left", true);
  });

  it("parses portable key shortcuts", async () => {
    const { execute, robot } = testRig();

    await execute({ action: "key", key: "CMD+SHIFT+P" });

    expect(robot.keyTap).toHaveBeenCalledWith("p", ["command", "shift"]);
  });

  it("releases the mouse if a drag fails", async () => {
    const { execute, robot } = testRig();
    vi.mocked(robot.moveMouseSmooth).mockImplementation(() => {
      throw new Error("drag failed");
    });

    await expect(
      execute({
        action: "left_click_drag",
        start_coordinate: [10, 20],
        coordinate: [30, 40],
      }),
    ).rejects.toThrow("drag failed");
    expect(robot.mouseToggle).toHaveBeenNthCalledWith(1, "down", "left");
    expect(robot.mouseToggle).toHaveBeenNthCalledWith(2, "up", "left");
  });

  it("returns actionable validation and permission errors", async () => {
    const { execute } = testRig({ accessibility: false });

    await expect(execute({ action: "left_click" })).rejects.toThrow(
      "requires 'coordinate'",
    );
    await expect(
      execute({ action: "left_click", coordinate: [2000, 10] }),
    ).rejects.toThrow("ACCESSIBILITY_PERMISSION_REQUIRED");
  });
});
