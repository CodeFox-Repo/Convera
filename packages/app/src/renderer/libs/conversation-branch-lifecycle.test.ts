import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  branchConversationWithRuntime,
  prepareConversationCleanupIntent,
  replayPendingConversationDeletion,
} from "./conversation-lifecycle";
import { db, type Conversation } from "./db/database";
import { databaseInitialization } from "./db/hooks";

const sourceConversationId = "branch-source";
const createdAt = new Date("2026-07-31T00:00:00.000Z");

function testLockManager(): LockManager {
  const held = new Set<string>();
  return {
    request: async <T>(
      name: string,
      options: LockOptions,
      callback: (lock: Lock | null) => Promise<T> | T,
    ): Promise<T> => {
      if (options.ifAvailable && held.has(name)) {
        return callback(null);
      }
      if (held.has(name)) {
        throw new Error(`Test lock is already held: ${name}`);
      }
      held.add(name);
      try {
        return await callback({ name, mode: "exclusive" } as Lock);
      } finally {
        held.delete(name);
      }
    },
    query: async () => ({ held: [], pending: [] }),
  } as unknown as LockManager;
}

async function seedSource(): Promise<void> {
  const source: Conversation = {
    id: sourceConversationId,
    title: "Source",
    agentId: null,
    modelId: "codex-cli:default",
    activeRevision: 3,
    activeProviderId: "codex-cli",
    activeModelId: "default",
    systemPrompt: null,
    metadata: { messageCount: 1 },
    createdAt,
    updatedAt: createdAt,
  };
  await db.conversations.add(source);
  await db.messages.add({
    id: "source-user",
    conversationId: sourceConversationId,
    role: "user",
    content: "branch here",
    senderId: "me",
    mentions: ["agent:fizz"],
    reactions: { "👍": ["me"] },
    status: "completed",
    createdAt,
  });
}

beforeEach(async () => {
  vi.unstubAllGlobals();
  await databaseInitialization;
  db.close();
  await db.delete();
  await db.open();
});

afterAll(async () => {
  db.close();
  await db.delete();
});

describe("conversation branch lifecycle", () => {
  it("persists cleanup intent before main and atomically publishes the local branch", async () => {
    await seedSource();
    let targetConversationId: string | undefined;
    const branchConversation = vi.fn(async (request) => {
      targetConversationId = request.targetConversationId;
      expect(
        await db.pendingConversationDeletions.get(request.targetConversationId),
      ).toMatchObject({
        conversationId: request.targetConversationId,
        forgetConversationMemory: true,
        state: "pending",
      });
      expect(
        await db.conversations.get(request.targetConversationId),
      ).toBeUndefined();
      return {
        success: true as const,
        data: {
          conversationId: request.targetConversationId,
          revision: 0,
          transcriptVersion: 0,
          memoryEpoch: 0,
          memoryVersion: 0,
          providers: [],
        },
      };
    });
    vi.stubGlobal("window", { localAI: { branchConversation } });

    const branchId = await branchConversationWithRuntime(
      sourceConversationId,
      0,
    );

    expect(branchId).toBe(targetConversationId);
    expect(await db.conversations.get(branchId)).toMatchObject({
      id: branchId,
      activeRevision: 0,
      metadata: {
        messageCount: 1,
        branchedFrom: {
          conversationId: sourceConversationId,
          messageIndex: 0,
        },
      },
    });
    expect(
      await db.messages.where("conversationId").equals(branchId).first(),
    ).toMatchObject({
      senderId: "me",
      mentions: ["agent:fizz"],
      reactions: { "👍": ["me"] },
    });
    expect(await db.pendingConversationDeletions.get(branchId)).toBeUndefined();
  });

  it("replays the durable cleanup intent when main branch committed before a renderer crash", async () => {
    const targetConversationId = "orphaned-main-branch";
    await prepareConversationCleanupIntent(targetConversationId);
    const deleteConversation = vi.fn(async () => ({
      success: true as const,
      data: { deleted: true },
    }));
    vi.stubGlobal("window", {
      localAI: {
        quiesceConversation: vi.fn(async () => ({
          success: true as const,
          data: { quiesced: true as const, leaseToken: "cleanup-lease" },
        })),
        getTurnRuntimeState: vi.fn(),
        acknowledgeTurnPersistence: vi.fn(),
        deleteConversation,
        resumeConversation: vi.fn(async () => ({
          success: true as const,
          data: { resumed: true },
        })),
      },
    });

    await replayPendingConversationDeletion(targetConversationId);
    await replayPendingConversationDeletion(targetConversationId);

    expect(deleteConversation).toHaveBeenCalledOnce();
    expect(deleteConversation).toHaveBeenCalledWith({
      conversationId: targetConversationId,
      forgetConversationMemory: true,
      leaseToken: "cleanup-lease",
    });
    expect(
      await db.pendingConversationDeletions.get(targetConversationId),
    ).toBeUndefined();
  });

  it("rejects branching a source with a pending deletion intent", async () => {
    await seedSource();
    await prepareConversationCleanupIntent(sourceConversationId);
    const branchConversation = vi.fn();
    vi.stubGlobal("window", { localAI: { branchConversation } });

    await expect(
      branchConversationWithRuntime(sourceConversationId, 0),
    ).rejects.toThrow("pending deletion");
    expect(branchConversation).not.toHaveBeenCalled();
  });

  it("cleans up the main branch when the source prefix changes before local publication", async () => {
    await seedSource();
    let targetConversationId = "";
    const deleteConversation = vi.fn(async () => ({
      success: true as const,
      data: { deleted: true },
    }));
    vi.stubGlobal("window", {
      localAI: {
        branchConversation: vi.fn(async (request) => {
          targetConversationId = request.targetConversationId;
          await db.messages.update("source-user", {
            content: "edited concurrently",
          });
          return {
            success: true as const,
            data: {
              conversationId: request.targetConversationId,
              revision: 0,
              transcriptVersion: 0,
              memoryEpoch: 0,
              memoryVersion: 0,
              providers: [],
            },
          };
        }),
        quiesceConversation: vi.fn(async () => ({
          success: true as const,
          data: { quiesced: true as const, leaseToken: "cleanup-lease" },
        })),
        getTurnRuntimeState: vi.fn(),
        acknowledgeTurnPersistence: vi.fn(),
        deleteConversation,
        resumeConversation: vi.fn(async () => ({
          success: true as const,
          data: { resumed: true },
        })),
      },
    });

    await expect(
      branchConversationWithRuntime(sourceConversationId, 0),
    ).rejects.toThrow("Source conversation changed");

    expect(deleteConversation).toHaveBeenCalledWith({
      conversationId: targetConversationId,
      forgetConversationMemory: true,
      leaseToken: "cleanup-lease",
    });
    expect(await db.conversations.get(targetConversationId)).toBeUndefined();
    expect(
      await db.pendingConversationDeletions.get(targetConversationId),
    ).toBeUndefined();
  });

  it("prevents another renderer from replaying a live branch cleanup intent", async () => {
    await seedSource();
    vi.stubGlobal("navigator", { locks: testLockManager() });
    let targetConversationId = "";
    let notifyBranchEntered: () => void = () => undefined;
    const branchEntered = new Promise<void>((resolve) => {
      notifyBranchEntered = resolve;
    });
    let releaseMainBranch: () => void = () => undefined;
    const mainBranchRelease = new Promise<void>((resolve) => {
      releaseMainBranch = resolve;
    });
    const deleteConversation = vi.fn();
    vi.stubGlobal("window", {
      localAI: {
        branchConversation: vi.fn(async (request) => {
          targetConversationId = request.targetConversationId;
          notifyBranchEntered();
          await mainBranchRelease;
          return {
            success: true as const,
            data: {
              conversationId: request.targetConversationId,
              revision: 0,
              transcriptVersion: 0,
              memoryEpoch: 0,
              memoryVersion: 0,
              providers: [],
            },
          };
        }),
        deleteConversation,
      },
    });

    const branch = branchConversationWithRuntime(sourceConversationId, 0);
    await branchEntered;
    await expect(
      replayPendingConversationDeletion(targetConversationId),
    ).resolves.toBe(false);
    expect(deleteConversation).not.toHaveBeenCalled();

    releaseMainBranch();
    await expect(branch).resolves.toBe(targetConversationId);
    expect(
      await db.pendingConversationDeletions.get(targetConversationId),
    ).toBeUndefined();
  });
});
