import { z } from "zod";

// JSONValue type definition to match AI SDK - properly typed without any
type JSONPrimitive = string | number | boolean | null;
type JSONValue = JSONPrimitive | JSONObject | JSONArray;
type JSONObject = { [key: string]: JSONValue };
type JSONArray = JSONValue[];

const JSONValueSchema: z.ZodType<JSONValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.string(),
    z.number(),
    z.boolean(),
    z.array(JSONValueSchema),
    z.record(z.string(), JSONValueSchema),
  ]),
);

// Attachment schema based on AI SDK interface
const AttachmentSchema = z.object({
  name: z.string().optional(),
  contentType: z.string().optional(),
  url: z.string(),
});

// ToolCall schema - represents a tool being called
const ToolCallSchema = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  args: z.record(z.string(), JSONValueSchema),
});

// ToolResult schema - represents the result of a tool call
const ToolResultSchema = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  args: z.record(z.string(), JSONValueSchema),
  result: JSONValueSchema,
});

// ToolInvocation schema - union of different tool states
const ToolInvocationSchema = z.union([
  // Partial call state
  z
    .object({
      state: z.literal("partial-call"),
      step: z.number().optional(),
    })
    .merge(ToolCallSchema),

  // Call state
  z
    .object({
      state: z.literal("call"),
      step: z.number().optional(),
    })
    .merge(ToolCallSchema),

  // Result state
  z
    .object({
      state: z.literal("result"),
      step: z.number().optional(),
    })
    .merge(ToolResultSchema),
]);

// Text UI Part schema
const TextUIPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

// Reasoning UI Part schema
const ReasoningDetailSchema = z.union([
  z.object({
    type: z.literal("text"),
    text: z.string(),
    signature: z.string().optional(),
  }),
  z.object({
    type: z.literal("redacted"),
    data: z.string(),
  }),
]);

const ReasoningUIPartSchema = z.object({
  type: z.literal("reasoning"),
  reasoning: z.string(),
  details: z.array(ReasoningDetailSchema),
});

// Tool Invocation UI Part schema
const ToolInvocationUIPartSchema = z.object({
  type: z.literal("tool-invocation"),
  toolInvocation: ToolInvocationSchema,
});

// Source UI Part schema (simplified LanguageModelV1Source)
const LanguageModelV1SourceSchema = z.object({
  type: z.string(),
  content: z.string(),
  experimental_providerMetadata: z
    .record(z.string(), JSONValueSchema)
    .optional(),
});

const SourceUIPartSchema = z.object({
  type: z.literal("source"),
  source: LanguageModelV1SourceSchema,
});

// File UI Part schema
const FileUIPartSchema = z.object({
  type: z.literal("file"),
  mimeType: z.string(),
  data: z.string(),
});

// Step Start UI Part schema
const StepStartUIPartSchema = z.object({
  type: z.literal("step-start"),
});

// Union of all UI Parts
const UIPartSchema = z.union([
  TextUIPartSchema,
  ReasoningUIPartSchema,
  ToolInvocationUIPartSchema,
  SourceUIPartSchema,
  FileUIPartSchema,
  StepStartUIPartSchema,
]);

// CreateUIMessage schema (for input - ID is optional)
export const CreateUIMessageSchema = z.object({
  id: z.string().optional(),
  createdAt: z.date().optional(),
  content: z.string(),
  reasoning: z.string().optional(),
  experimental_attachments: z.array(AttachmentSchema).optional(),
  role: z.enum(["system", "user", "assistant", "data"]),
  data: JSONValueSchema.optional(),
  annotations: z.array(JSONValueSchema).optional(),
  toolInvocations: z.array(ToolInvocationSchema).optional(),
  parts: z.array(UIPartSchema).optional(),
});

// UIMessage schema (for output - ID is required)
export const UIMessageSchema = z.object({
  id: z.string(),
  createdAt: z.date().optional(),
  content: z.string(),
  reasoning: z.string().optional(),
  experimental_attachments: z.array(AttachmentSchema).optional(),
  role: z.enum(["system", "user", "assistant", "data"]),
  data: JSONValueSchema.optional(),
  annotations: z.array(JSONValueSchema).optional(),
  toolInvocations: z.array(ToolInvocationSchema).optional(),
  parts: z.array(UIPartSchema).optional(),
});

// Chat request schema
export const ChatRequestSchema = z.object({
  messages: z.array(CreateUIMessageSchema).min(1),
  config: z.record(z.string(), JSONValueSchema).optional(),
  agentId: z.string().optional(),
  modelId: z.string().optional(),
  id: z.string().optional(),
});

// Type exports
export type CreateUIMessage = z.infer<typeof CreateUIMessageSchema>;
export type UIMessage = z.infer<typeof UIMessageSchema>;
export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export type Attachment = z.infer<typeof AttachmentSchema>;
export type ToolCall = z.infer<typeof ToolCallSchema>;
export type ToolResult = z.infer<typeof ToolResultSchema>;
export type ToolInvocation = z.infer<typeof ToolInvocationSchema>;
export type UIPart = z.infer<typeof UIPartSchema>;
export type TextUIPart = z.infer<typeof TextUIPartSchema>;
export type ReasoningUIPart = z.infer<typeof ReasoningUIPartSchema>;
export type ToolInvocationUIPart = z.infer<typeof ToolInvocationUIPartSchema>;
export type SourceUIPart = z.infer<typeof SourceUIPartSchema>;
export type FileUIPart = z.infer<typeof FileUIPartSchema>;
export type StepStartUIPart = z.infer<typeof StepStartUIPartSchema>;
