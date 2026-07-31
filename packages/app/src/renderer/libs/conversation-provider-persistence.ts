import { db } from "./db/database";
import type { ProviderSelection } from "./provider-selection";

type ProviderSelectionWriter = (
  conversationId: string,
  selection: ProviderSelection,
) => Promise<void>;

/**
 * Serializes provider/model writes per conversation and exposes a flush barrier
 * for actions that must read the authoritative Dexie selection immediately
 * after a UI click.
 */
export class ConversationProviderPersistence {
  private readonly pending = new Map<string, Promise<void>>();
  private readonly failures = new Map<string, unknown>();

  constructor(private readonly write: ProviderSelectionWriter) {}

  enqueue(conversationId: string, selection: ProviderSelection): Promise<void> {
    const previous = this.pending.get(conversationId) ?? Promise.resolve();
    const write = previous
      .catch(() => undefined)
      .then(() => this.write(conversationId, selection))
      .then(
        () => {
          this.failures.delete(conversationId);
        },
        (error) => {
          this.failures.set(conversationId, error);
          throw error;
        },
      );
    this.pending.set(conversationId, write);
    void write
      .finally(() => {
        if (this.pending.get(conversationId) === write) {
          this.pending.delete(conversationId);
        }
      })
      .catch(() => undefined);
    return write;
  }

  async flush(conversationId: string): Promise<void> {
    await this.pending.get(conversationId);
    if (this.failures.has(conversationId)) {
      throw this.failures.get(conversationId);
    }
  }
}

const providerPersistence = new ConversationProviderPersistence(
  async (conversationId, selection) => {
    await db.conversations.update(conversationId, {
      modelId: `${selection.configId}:${selection.modelId}`,
      activeProviderId: selection.configId,
      activeModelId: selection.modelId,
      updatedAt: new Date(),
    });
  },
);

export function persistConversationProviderSelection(
  conversationId: string,
  selection: ProviderSelection,
): Promise<void> {
  return providerPersistence.enqueue(conversationId, selection);
}

export function flushConversationProviderSelection(
  conversationId: string,
): Promise<void> {
  return providerPersistence.flush(conversationId);
}
