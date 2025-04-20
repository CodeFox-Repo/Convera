import { ToolSet } from "ai";

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  tools: ToolSet;
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
}
export interface AgentChatOptions {
  agentId?: string;
  modelId?: string;
}
