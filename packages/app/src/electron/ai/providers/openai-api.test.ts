import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OpenAIApiAdapter } from "./openai-api";

const previousKey = process.env.OPENAI_API_KEY;

describe("OpenAIApiAdapter", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-openai-key";
  });

  afterEach(() => {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  });

  it("prepares the locked OpenAI model for Pi agent-core", async () => {
    const adapter = new OpenAIApiAdapter();
    const status = await adapter.getStatus();
    const run = await adapter.prepareRun(
      {
        requestId: "request-1",
        conversationId: "conversation-1",
        turnId: "turn-1",
        providerId: "openai-api",
        operation: {
          kind: "append",
          message: { role: "user", content: "hello" },
        },
      },
      status,
    );

    expect(run).toMatchObject({
      executionEngine: "pi-agent-core",
      apiKey: "test-openai-key",
      reasoning: "medium",
      model: {
        id: "gpt-5.6-luna",
        provider: "openai",
        api: "openai-responses",
      },
    });
    if (run.executionEngine !== "pi-agent-core") {
      throw new Error("Expected Pi agent-core execution");
    }
    expect(adapter.resumesNativeSession).toBe(false);
    expect(run.getNativeSessionId(undefined)).toBe("openai-api:conversation-1");
    expect(
      await run.onPayload?.({ text: { format: "plain" } }, run.model),
    ).toEqual({
      text: { format: "plain", verbosity: "low" },
    });
  });
});
