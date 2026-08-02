export type PiThinkingLevel =
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export interface PiModel {
  id: string;
  name: string;
  api: string;
  provider: string;
  baseUrl: string;
  reasoning: boolean;
  input: Array<"text" | "image">;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow: number;
  maxTokens: number;
  headers?: Record<string, string>;
  compat?: unknown;
}

export interface PiUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

export interface PiTextContent {
  type: "text";
  text: string;
}

export interface PiImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

export interface PiThinkingContent {
  type: "thinking";
  thinking: string;
  thinkingSignature?: string;
}

export interface PiToolCall {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface PiUserMessage {
  role: "user";
  content: string | Array<PiTextContent | PiImageContent>;
  timestamp: number;
}

export interface PiAssistantMessage {
  role: "assistant";
  content: Array<PiTextContent | PiThinkingContent | PiToolCall>;
  api: string;
  provider: string;
  model: string;
  usage: PiUsage;
  stopReason: "pending" | "stop" | "length" | "toolUse" | "error" | "aborted";
  errorMessage?: string;
  timestamp: number;
}

export interface PiToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: Array<PiTextContent | PiImageContent>;
  details?: unknown;
  isError: boolean;
  timestamp: number;
}

export type PiMessage =
  | PiUserMessage
  | PiAssistantMessage
  | PiToolResultMessage;

export interface PiToolResult {
  content: Array<PiTextContent | PiImageContent>;
  details: unknown;
  terminate?: boolean;
}

export interface PiAgentTool {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(
    toolCallId: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<PiToolResult>;
}

export interface PiAgentContext {
  systemPrompt?: string;
  messages: PiMessage[];
  tools?: PiAgentTool[];
}

export interface PiStreamOptions {
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  apiKey?: string;
  fetch?: typeof globalThis.fetch;
  reasoning?: PiThinkingLevel;
  sessionId?: string;
  onPayload?: (
    payload: unknown,
    model: PiModel,
  ) => unknown | undefined | Promise<unknown | undefined>;
}

export type PiStreamFn = (
  model: PiModel,
  context: PiAgentContext,
  options?: PiStreamOptions,
) => PiAssistantMessageEventStream | Promise<PiAssistantMessageEventStream>;

export type PiAssistantMessageEvent =
  | { type: "start"; partial: PiAssistantMessage }
  | { type: "text_start"; contentIndex: number; partial: PiAssistantMessage }
  | {
      type: "text_delta";
      contentIndex: number;
      delta: string;
      partial: PiAssistantMessage;
    }
  | {
      type: "text_end";
      contentIndex: number;
      content: string;
      partial: PiAssistantMessage;
    }
  | {
      type: "thinking_start";
      contentIndex: number;
      partial: PiAssistantMessage;
    }
  | {
      type: "thinking_delta";
      contentIndex: number;
      delta: string;
      partial: PiAssistantMessage;
    }
  | {
      type: "thinking_end";
      contentIndex: number;
      content: string;
      partial: PiAssistantMessage;
    }
  | {
      type: "toolcall_start";
      contentIndex: number;
      partial: PiAssistantMessage;
    }
  | {
      type: "toolcall_delta";
      contentIndex: number;
      delta: string;
      partial: PiAssistantMessage;
    }
  | { type: "toolcall_end"; contentIndex: number; partial: PiAssistantMessage }
  | { type: "done"; message: PiAssistantMessage }
  | { type: "error"; error: PiAssistantMessage };

export interface PiAssistantMessageEventStream
  extends AsyncIterable<PiAssistantMessageEvent> {
  result(): Promise<PiAssistantMessage>;
}

export type PiAgentEvent =
  | { type: "agent_start" }
  | { type: "agent_end"; messages: PiMessage[] }
  | { type: "turn_start" }
  | {
      type: "turn_end";
      message: PiMessage;
      toolResults: PiToolResultMessage[];
    }
  | { type: "message_start"; message: PiMessage }
  | {
      type: "message_update";
      message: PiMessage;
      assistantMessageEvent: PiAssistantMessageEvent;
    }
  | { type: "message_end"; message: PiMessage }
  | {
      type: "tool_execution_start";
      toolCallId: string;
      toolName: string;
      args: unknown;
    }
  | {
      type: "tool_execution_update";
      toolCallId: string;
      toolName: string;
      args: unknown;
      partialResult: unknown;
    }
  | {
      type: "tool_execution_end";
      toolCallId: string;
      toolName: string;
      result: unknown;
      isError: boolean;
    };

export interface PiAgentLoopConfig extends PiStreamOptions {
  model: PiModel;
  convertToLlm(messages: PiMessage[]): PiMessage[] | Promise<PiMessage[]>;
  toolExecution?: "sequential" | "parallel";
  shouldStopAfterTurn?(context: {
    message: PiAssistantMessage;
    toolResults: PiToolResultMessage[];
    context: PiAgentContext;
    newMessages: PiMessage[];
  }): boolean | Promise<boolean>;
}

export type PiRunAgentLoop = (
  prompts: PiMessage[],
  context: PiAgentContext,
  config: PiAgentLoopConfig,
  emit: (event: PiAgentEvent) => Promise<void> | void,
  signal: AbortSignal | undefined,
  streamFn: PiStreamFn,
) => Promise<PiMessage[]>;

export interface PiAgentCoreModule {
  runAgentLoop: PiRunAgentLoop;
}

export interface PiAiCompatModule {
  getModels(provider: string): PiModel[];
  streamSimple: PiStreamFn;
}
