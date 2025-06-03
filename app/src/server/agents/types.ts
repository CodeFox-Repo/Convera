// New interface for standardized tool reference
import { z } from "zod";

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
}

export interface AgentChatOptions {
  agentId?: string;
  modelId?: string;
}

export const toolReferenceSchema = z.object({
  mcpName: z.string(),
  toolName: z.string(),
  isBuiltIn: z.boolean().optional(),
});

export const createAgentSchema = z.object({
  name: z.string(),
  description: z.string(),
  systemPrompt: z.string(),
  toolReferences: z.array(toolReferenceSchema),
  modelId: z.string().optional(),
  iconUrl: z.string().optional(),
  avatar: z.string().optional(),
  category: z.string().optional(),
  type: z.string().optional(),
});

export const updateAgentSchema = createAgentSchema.extend({
  id: z.string(),
});

export type CreateAgentInput = z.infer<typeof createAgentSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;
