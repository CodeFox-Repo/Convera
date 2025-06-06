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
  modelId?: string;
  iconUrl?: string;
  category?: string;
  avatar?: string;
  type?: string;
  predefined?: boolean; // Flag to indicate if this is a built-in agent
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

// Zod schemas for validating agent-related requests
import { z } from "zod";

export const ToolReferenceSchema = z.object({
  mcpName: z.string(),
  toolName: z.string(),
  isBuiltIn: z.boolean().optional(),
});

export const CreateAgentSchema = z.object({
  name: z.string(),
  description: z.string(),
  systemPrompt: z.string(),
  toolReferences: z.array(ToolReferenceSchema),
  modelId: z.string().optional(),
  iconUrl: z.string().optional(),
  avatar: z.string().optional(),
  category: z.string().optional(),
  type: z.string().optional(),
});

export const UpdateAgentSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  systemPrompt: z.string().optional(),
  toolReferences: z.array(ToolReferenceSchema).optional(),
  modelId: z.string().optional(),
  iconUrl: z.string().optional(),
  avatar: z.string().optional(),
  category: z.string().optional(),
  type: z.string().optional(),
});

export type CreateAgentRequest = z.infer<typeof CreateAgentSchema>;
export type UpdateAgentRequest = z.infer<typeof UpdateAgentSchema>;
