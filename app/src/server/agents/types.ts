import { ToolSet } from "ai";

// New interface for standardized tool reference
export interface ToolReference {
  mcpName: string;
  toolName: string;
  isBuiltIn?: boolean;
}

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  toolReferences: ToolReference[]; // Primary field for tools
  tools?: ToolSet; // @deprecated - Use only at runtime, not for storage
  toolNames?: string[]; // @deprecated - For backward compatibility only
  modelId?: string;
  iconUrl?: string;
  category?: string;
  avatar?: string;
  type?: string;
}

export interface AgentListItem {
  id: string;
  name: string;
  description: string;
  category: string;
  iconUrl?: string;
  toolReferences: ToolReference[]; // Primary field for tools
  toolNames?: string[]; // @deprecated - For backward compatibility only
}

export interface AgentChatOptions {
  agentId?: string;
  modelId?: string;
}
