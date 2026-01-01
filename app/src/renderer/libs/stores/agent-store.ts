/**
 * Agent Store - Dexie 版本
 *
 * 完全本地存储，不再与云端同步
 * 使用 Dexie liveQuery 实现实时数据更新和多窗口同步
 */

import {
  useAgents,
  useAgent,
  createAgent as createAgentDB,
  updateAgent as updateAgentDB,
  deleteAgent as deleteAgentDB,
  db,
  type Agent,
  DEFAULT_AGENT,
} from "../db";
import { useSelectionStore } from "../db/ui-state";

// Re-export types for backward compatibility
export type { Agent };
export { DEFAULT_AGENT };

// ==================== Hooks ====================

/**
 * 主要的 Agent store hook
 * 替代旧的 useAgentStore
 */
export function useAgentStore() {
  const agents = useAgents();
  const { selectedAgentId, setSelectedAgent: setSelectedAgentId } = useSelectionStore();
  const selectedAgent = useAgent(selectedAgentId);

  return {
    // State
    availableAgents: agents || [DEFAULT_AGENT],
    selectedAgent: selectedAgent || (selectedAgentId === "" || selectedAgentId === null ? DEFAULT_AGENT : null),
    agentChanged: false,
    prevAgentId: null,

    // Actions
    setSelectedAgent: (agent: Agent | null) => {
      setSelectedAgentId(agent?.id ?? null);

      // Dispatch event for other components
      window.dispatchEvent(
        new CustomEvent("agent-selected", {
          detail: { agent },
        })
      );
    },

    setAvailableAgents: () => {
      // No-op, Dexie handles this
    },

    fetchAgents: async () => {
      // No-op, Dexie handles reactivity
    },

    updateSelectedAgent: (updatedAgent: Agent) => {
      if (updatedAgent.id === DEFAULT_AGENT.id || updatedAgent.id === "") {
        return;
      }
      updateAgentDB(updatedAgent.id, updatedAgent);
    },

    updateAvailableAgent: (updatedAgent: Agent) => {
      if (updatedAgent.id === DEFAULT_AGENT.id || updatedAgent.id === "") {
        return;
      }
      updateAgentDB(updatedAgent.id, updatedAgent);
    },

    updateAgent: async (agent: Agent) => {
      if (agent.id === DEFAULT_AGENT.id || agent.id === "") {
        return;
      }
      await updateAgentDB(agent.id, {
        name: agent.name,
        description: agent.description,
        systemPrompt: agent.systemPrompt,
        disableToolReferences: agent.disableToolReferences,
        selectedMCPs: agent.selectedMCPs,
      });
    },

    createAgent: async (agentData: Omit<Agent, "id" | "createdAt" | "updatedAt" | "isBuiltIn" | "predefined">) => {
      const id = await createAgentDB(agentData);
      const newAgent: Agent = {
        ...agentData,
        id,
        isBuiltIn: false,
        predefined: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      return newAgent;
    },

    deleteAgent: async (agentId: string) => {
      if (agentId === DEFAULT_AGENT.id || agentId === "") {
        return false;
      }

      await deleteAgentDB(agentId);

      // Clear selected agent if it was deleted
      if (selectedAgentId === agentId) {
        setSelectedAgentId(null);
      }

      return true;
    },

    triggerAgentSelect: async (
      e: React.MouseEvent<HTMLButtonElement>,
      agent: Agent | null | undefined
    ) => {
      e.stopPropagation();
      window.dispatchEvent(
        new CustomEvent("toggle-agent-popover", {
          detail: { selectedAgent: agent ?? null },
        })
      );
    },

    handleAgentChange: (accept: boolean) => {
      // No-op in new architecture
      if (!accept) {
        // Could revert to previous agent if needed
      }
    },

    subscribeToAgentChanges: () => {
      // No-op, Dexie liveQuery handles reactivity
      return () => {};
    },
  };
}

// ==================== Static State Access (for non-React contexts) ====================

/**
 * 用于非 React 上下文中获取状态
 * 兼容旧的 useAgentStore.getState() 调用模式
 */
useAgentStore.getState = () => {
  const { selectedAgentId } = useSelectionStore.getState();

  return {
    selectedAgentId,
    selectedAgent: null as Agent | null, // Sync access not available, use getSelectedAgent
    availableAgents: [] as Agent[],
    // Async version to get actual data
    getSelectedAgent: async (): Promise<Agent | null> => {
      if (!selectedAgentId || selectedAgentId === "" || selectedAgentId === DEFAULT_AGENT.id) {
        return DEFAULT_AGENT;
      }
      return await db.agents.get(selectedAgentId) || null;
    },
  };
};

// ==================== Standalone Actions ====================

/**
 * 直接创建 Agent（不需要 hook）
 */
export async function createAgent(
  agentData: Omit<Agent, "id" | "createdAt" | "updatedAt" | "isBuiltIn" | "predefined">
): Promise<Agent> {
  const id = await createAgentDB(agentData);
  return {
    ...agentData,
    id,
    isBuiltIn: false,
    predefined: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * 直接更新 Agent（不需要 hook）
 */
export async function updateAgent(
  id: string,
  updates: Partial<Omit<Agent, "id" | "createdAt" | "isBuiltIn">>
): Promise<void> {
  if (id === DEFAULT_AGENT.id || id === "") {
    return;
  }
  await updateAgentDB(id, updates);
}

/**
 * 直接删除 Agent（不需要 hook）
 */
export async function deleteAgent(id: string): Promise<boolean> {
  if (id === DEFAULT_AGENT.id || id === "") {
    return false;
  }
  await deleteAgentDB(id);
  return true;
}
