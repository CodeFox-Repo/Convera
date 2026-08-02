import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FireworksApiAdapter } from "./fireworks-api";

const previousKey = process.env.FIREWORKS_API_KEY;

describe("FireworksApiAdapter", () => {
  beforeEach(() => {
    process.env.FIREWORKS_API_KEY = "test-fireworks-key";
  });

  afterEach(() => {
    if (previousKey === undefined) delete process.env.FIREWORKS_API_KEY;
    else process.env.FIREWORKS_API_KEY = previousKey;
  });

  it("declares stateless history while preserving conversation affinity", async () => {
    const adapter = new FireworksApiAdapter();
    const status = await adapter.getStatus();
    const run = await adapter.prepareRun(
      {
        requestId: "request-1",
        conversationId: "conversation-1",
        turnId: "turn-1",
        providerId: "fireworks-api",
        operation: {
          kind: "append",
          message: { role: "user", content: "hello" },
        },
      },
      status,
      {
        tools: [],
        requestInteraction: async () => ({}),
      },
    );

    expect(adapter.resumesNativeSession).toBe(false);
    expect(run.getNativeSessionId(undefined)).toBe(
      "fireworks-api:conversation-1",
    );
  });
});
