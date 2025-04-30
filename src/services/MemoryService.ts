import { getSettings } from "@/utils/settings";
import { MemorySettings } from "@/types/settings";

interface MemoryItem {
  id: string;
  type: string;
  content: string;
  timestamp: number;
  tags: string[];
}

class MemoryService {
  private static instance: MemoryService;
  private memorySettings: MemorySettings;
  private memoryItems: MemoryItem[] = [];
  private storageKey = "foxchat_memory";

  private constructor() {
    this.memorySettings = getSettings().memory;
    this.loadMemoryFromStorage();
  }

  public static getInstance(): MemoryService {
    if (!MemoryService.instance) {
      MemoryService.instance = new MemoryService();
    }
    return MemoryService.instance;
  }

  private loadMemoryFromStorage(): void {
    if (!this.memorySettings.enabled) return;

    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);

        // Apply memory lifespan filtering
        const now = Date.now();
        let filteredItems = parsed;

        if (this.memorySettings.memoryLifespan === "session") {
          // For session memory, we only show items that were created in this browser session
          // We don't need to filter here as session memory is cleared when the browser is closed
        } else if (
          this.memorySettings.memoryLifespan === "custom" &&
          this.memorySettings.customLifespanDays
        ) {
          // Filter by custom days
          const cutoffTime =
            now - this.memorySettings.customLifespanDays * 24 * 60 * 60 * 1000;
          filteredItems = parsed.filter(
            (item: MemoryItem) => item.timestamp >= cutoffTime,
          );
        }

        // Apply max items limit
        if (filteredItems.length > this.memorySettings.maxMemoryItems) {
          if (this.memorySettings.prioritizeRecent) {
            // Sort by timestamp (newest first) and take only the specified number of items
            filteredItems.sort(
              (a: MemoryItem, b: MemoryItem) => b.timestamp - a.timestamp,
            );
            filteredItems = filteredItems.slice(
              0,
              this.memorySettings.maxMemoryItems,
            );
          } else {
            // Just take the first N items based on their existing order
            filteredItems = filteredItems.slice(
              0,
              this.memorySettings.maxMemoryItems,
            );
          }
        }

        this.memoryItems = filteredItems;
      }
    } catch (error) {
      console.error("Failed to load memory from storage:", error);
      this.memoryItems = [];
    }
  }

  private saveMemoryToStorage(): void {
    if (!this.memorySettings.enabled) return;

    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.memoryItems));
    } catch (error) {
      console.error("Failed to save memory to storage:", error);
    }
  }

  public refreshSettings(): void {
    this.memorySettings = getSettings().memory;
    this.loadMemoryFromStorage();
  }

  public addMemoryItem(
    type: string,
    content: string,
    tags: string[] = [],
  ): string {
    if (!this.memorySettings.enabled) return "";

    // Check if the memory type is enabled
    if (
      (type === "user_info" && !this.memorySettings.rememberUserInfo) ||
      (type === "conversation_context" &&
        !this.memorySettings.rememberConversationContext) ||
      (type === "previous_interaction" &&
        !this.memorySettings.rememberPreviousInteractions) ||
      (type === "code_context" && !this.memorySettings.rememberCodeContext)
    ) {
      return "";
    }

    const id = `memory_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const memoryItem: MemoryItem = {
      id,
      type,
      content,
      timestamp: Date.now(),
      tags,
    };

    this.memoryItems.push(memoryItem);

    // Apply max items limit if needed
    if (this.memoryItems.length > this.memorySettings.maxMemoryItems) {
      if (this.memorySettings.prioritizeRecent) {
        // Sort by timestamp and remove oldest
        this.memoryItems.sort((a, b) => b.timestamp - a.timestamp);
        this.memoryItems = this.memoryItems.slice(
          0,
          this.memorySettings.maxMemoryItems,
        );
      } else {
        // Remove oldest items (first in the array)
        this.memoryItems = this.memoryItems.slice(
          this.memoryItems.length - this.memorySettings.maxMemoryItems,
        );
      }
    }

    this.saveMemoryToStorage();
    return id;
  }

  public getMemoryByType(type: string): MemoryItem[] {
    if (!this.memorySettings.enabled) return [];

    // Check if the memory type is enabled
    if (
      (type === "user_info" && !this.memorySettings.rememberUserInfo) ||
      (type === "conversation_context" &&
        !this.memorySettings.rememberConversationContext) ||
      (type === "previous_interaction" &&
        !this.memorySettings.rememberPreviousInteractions) ||
      (type === "code_context" && !this.memorySettings.rememberCodeContext)
    ) {
      return [];
    }

    return this.memoryItems.filter((item) => item.type === type);
  }

  public getAllMemory(): MemoryItem[] {
    if (!this.memorySettings.enabled) return [];

    const result: MemoryItem[] = [];

    // Filter based on enabled memory types
    for (const item of this.memoryItems) {
      if (
        (item.type === "user_info" && this.memorySettings.rememberUserInfo) ||
        (item.type === "conversation_context" &&
          this.memorySettings.rememberConversationContext) ||
        (item.type === "previous_interaction" &&
          this.memorySettings.rememberPreviousInteractions) ||
        (item.type === "code_context" &&
          this.memorySettings.rememberCodeContext)
      ) {
        result.push(item);
      }
    }

    return result;
  }

  public getMemoryByTags(tags: string[]): MemoryItem[] {
    if (!this.memorySettings.enabled || tags.length === 0) return [];

    return this.memoryItems.filter((item) => {
      // Check if the memory type is enabled
      if (
        (item.type === "user_info" && !this.memorySettings.rememberUserInfo) ||
        (item.type === "conversation_context" &&
          !this.memorySettings.rememberConversationContext) ||
        (item.type === "previous_interaction" &&
          !this.memorySettings.rememberPreviousInteractions) ||
        (item.type === "code_context" &&
          !this.memorySettings.rememberCodeContext)
      ) {
        return false;
      }

      // Check if any of the item's tags match the requested tags
      return item.tags.some((tag) => tags.includes(tag));
    });
  }

  public clearAllMemory(): void {
    this.memoryItems = [];
    this.saveMemoryToStorage();
  }

  public deleteMemoryItem(id: string): boolean {
    const initialLength = this.memoryItems.length;
    this.memoryItems = this.memoryItems.filter((item) => item.id !== id);

    if (this.memoryItems.length !== initialLength) {
      this.saveMemoryToStorage();
      return true;
    }

    return false;
  }

  public generateMemoryContext(): string {
    if (!this.memorySettings.enabled) return "";

    const allMemory = this.getAllMemory();
    if (
      allMemory.length === 0 &&
      !this.memorySettings.includePromptInstructions
    )
      return "";

    // Create a formatted memory context for the AI
    const memoryContext = ["## Memory Context"];

    // Add memory prompt instructions if enabled
    if (
      this.memorySettings.includePromptInstructions &&
      this.memorySettings.promptInstructions
    ) {
      memoryContext.push("### Memory Instructions");
      memoryContext.push(this.memorySettings.promptInstructions);
      memoryContext.push("");
    }

    if (allMemory.length > 0) {
      memoryContext.push(
        "The following information has been remembered from previous interactions:",
      );

      // Group by type
      const userInfo = allMemory.filter((item) => item.type === "user_info");
      const conversationContext = allMemory.filter(
        (item) => item.type === "conversation_context",
      );
      const previousInteractions = allMemory.filter(
        (item) => item.type === "previous_interaction",
      );
      const codeContext = allMemory.filter(
        (item) => item.type === "code_context",
      );

      if (userInfo.length > 0) {
        memoryContext.push("\n### User Information");
        userInfo.forEach((item) => memoryContext.push(`- ${item.content}`));
      }

      if (conversationContext.length > 0) {
        memoryContext.push("\n### Conversation Context");
        conversationContext.forEach((item) =>
          memoryContext.push(`- ${item.content}`),
        );
      }

      if (previousInteractions.length > 0) {
        memoryContext.push("\n### Previous Interactions");
        previousInteractions.forEach((item) =>
          memoryContext.push(`- ${item.content}`),
        );
      }

      if (codeContext.length > 0) {
        memoryContext.push("\n### Code Context");
        codeContext.forEach((item) => memoryContext.push(`- ${item.content}`));
      }
    }

    return memoryContext.join("\n");
  }
}

export default MemoryService;
