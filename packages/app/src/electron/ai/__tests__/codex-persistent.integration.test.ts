import type {
  LocalAIChatRequest,
  LocalAIStreamEvent,
} from "@/shared/types/local-ai";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { LocalAiRuntime } from "../runtime";
import { JsonSessionStateRepository } from "../session/repository";

const runRealCodex = process.env.CONVERA_REAL_CODEX_TEST === "1";

async function runTurn(
  runtime: LocalAiRuntime,
  request: LocalAIChatRequest,
): Promise<{ text: string; events: LocalAIStreamEvent[] }> {
  let text = "";
  const events: LocalAIStreamEvent[] = [];
  await runtime.startChat(request, (event) => {
    events.push(event);
    if (event.type === "ui-message" && event.chunk.type === "text-delta") {
      text += event.chunk.delta;
    } else if (event.type === "interaction") {
      void runtime.respondToInteraction(event.requestId, event.interactionId, {
        approved: false,
      });
    }
  });
  return { text, events };
}

describe.skipIf(!runRealCodex)("real Codex persistent session", () => {
  it("resumes provider-owned history after the Convera runtime restarts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "convera-codex-real-"));
    const statePath = join(directory, "sessions.json");
    const conversationId = `real-codex-${randomUUID()}`;
    const nonce = `CONVERA-${randomUUID()}`;
    const firstRepository = new JsonSessionStateRepository({
      path: statePath,
    });
    const firstRuntime = new LocalAiRuntime({
      workingDirectory: directory,
      sessionRepository: firstRepository,
      getToolGroups: () => [],
    });

    const first = await runTurn(firstRuntime, {
      requestId: randomUUID(),
      conversationId,
      turnId: randomUUID(),
      providerId: "codex-cli",
      operation: {
        kind: "append",
        message: {
          role: "user",
          content: `Remember this exact nonce for the next turn: ${nonce}. Reply only SAVED.`,
        },
      },
    });
    expect(first.events).not.toContainEqual(
      expect.objectContaining({ type: "error" }),
    );
    expect(first.events).toContainEqual(
      expect.objectContaining({ type: "finish", finishReason: "stop" }),
    );
    const originalBinding = (
      await firstRepository.getBindings(conversationId)
    )[0];
    expect(originalBinding?.nativeSessionId).toBeTruthy();
    await firstRuntime.dispose();

    const secondRepository = new JsonSessionStateRepository({
      path: statePath,
    });
    const secondRuntime = new LocalAiRuntime({
      workingDirectory: directory,
      sessionRepository: secondRepository,
      getToolGroups: () => [],
    });
    const second = await runTurn(secondRuntime, {
      requestId: randomUUID(),
      conversationId,
      turnId: randomUUID(),
      expectedRevision: 0,
      providerId: "codex-cli",
      operation: {
        kind: "append",
        message: {
          role: "user",
          content:
            "Reply only with the exact nonce I asked you to remember in the previous turn.",
        },
      },
    });

    expect(second.events).not.toContainEqual(
      expect.objectContaining({ type: "error" }),
    );
    expect(second.text).toContain(nonce);
    expect(
      (await secondRepository.getBindings(conversationId))[0]?.nativeSessionId,
    ).toBe(originalBinding?.nativeSessionId);
    await secondRuntime.dispose();
  }, 180_000);
});
