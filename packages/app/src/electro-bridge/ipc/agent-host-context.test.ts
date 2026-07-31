import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentHost } from "@/electron/agent-host/host";
import type { AgentHostRendererBridge } from "@/electron/agent-host/renderer-bridge";
import type { AgentHostDispatch } from "@/shared/types/agent-host";

vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
}));

import { AGENT_HOST_CHANNELS } from "./agent-host-api";
import { setupAgentHostIPC } from "./agent-host-context";

type Handler = (event: FakeInvokeEvent, ...args: never[]) => unknown;

class FakeWebContents extends EventEmitter {
  readonly mainFrame = {};
  private destroyed = false;

  isDestroyed() {
    return this.destroyed;
  }
}

interface FakeInvokeEvent {
  sender: FakeWebContents;
  senderFrame: object;
}

function event(sender: FakeWebContents): FakeInvokeEvent {
  return { sender, senderFrame: sender.mainFrame };
}

function mainIPC() {
  const handlers = new Map<string, Handler>();
  return {
    handlers,
    ipc: {
      handle: (channel: string, handler: Handler) =>
        handlers.set(channel, handler),
      removeHandler: (channel: string) => handlers.delete(channel),
    },
  };
}

const dispatch: AgentHostDispatch = {
  channelId: "channel",
  conversationId: "conversation",
  triggerMessageId: "message",
  contextMessageIds: ["message"],
  mode: "direct",
  offeredAgentMemberIds: ["agent:fizz"],
  targets: [{ agentId: "fizz", memberId: "agent:fizz" }],
  chain: { hops: 0, invoked: ["agent:fizz"] },
};

describe("Agent Host IPC", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts only after the renderer is ready and forwards durable dispatches", async () => {
    const sender = new FakeWebContents();
    const host = {
      start: vi.fn(),
      enqueue: vi.fn(async () => [{ id: "job" }]),
      listJobs: vi.fn(async () => []),
      cancel: vi.fn(async () => true),
    } as unknown as AgentHost;
    const bridge = {
      respond: vi.fn(() => true),
    } as unknown as AgentHostRendererBridge;
    const { handlers, ipc } = mainIPC();
    setupAgentHostIPC(
      {
        host,
        bridge,
        getAllowedWebContents: () => sender as never,
      },
      ipc as never,
    );

    expect(
      await handlers.get(AGENT_HOST_CHANNELS.READY)?.(event(sender)),
    ).toEqual({ success: true });
    expect(host.start).toHaveBeenCalledOnce();
    expect(
      await handlers.get(AGENT_HOST_CHANNELS.ENQUEUE)?.(
        event(sender),
        dispatch as never,
      ),
    ).toEqual({ success: true, jobs: [{ id: "job" }] });
    expect(host.enqueue).toHaveBeenCalledWith(dispatch);
  });

  it("rejects another renderer and does not accept forged responses", async () => {
    const allowed = new FakeWebContents();
    const attacker = new FakeWebContents();
    const host = {
      enqueue: vi.fn(),
    } as unknown as AgentHost;
    const bridge = {
      respond: vi.fn(),
    } as unknown as AgentHostRendererBridge;
    const { handlers, ipc } = mainIPC();
    setupAgentHostIPC(
      {
        host,
        bridge,
        getAllowedWebContents: () => allowed as never,
      },
      ipc as never,
    );

    expect(
      await handlers.get(AGENT_HOST_CHANNELS.ENQUEUE)?.(
        event(attacker),
        dispatch as never,
      ),
    ).toMatchObject({
      success: false,
      error: expect.stringContaining("allowed"),
    });
    expect(
      await handlers.get(AGENT_HOST_CHANNELS.RESPOND)?.(event(attacker), {
        requestId: "request",
        success: true,
        data: {},
      } as never),
    ).toMatchObject({ success: false });
    expect(host.enqueue).not.toHaveBeenCalled();
    expect(bridge.respond).not.toHaveBeenCalled();
  });
});
