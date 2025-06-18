import { createAnthropic } from "@ai-sdk/anthropic";
import { zValidator } from "@hono/zod-validator";
import { appendResponseMessages, Message, streamText, ToolSet } from "ai";
import { Hono } from "hono";
import { z } from "zod";
import {
  deleteCustomAgent,
  getAgentById,
  getAgentList,
  saveCustomAgent,
} from "../agents";
import {
  AgentDefinition,
  CreateAgentSchema,
  ToolReference,
  UpdateAgentSchema,
} from "../agents/types";
import { desktopAutomationTools } from "../builtIn-tools/desktop-automation";
import { desktopAutomationPrompt } from "../builtIn-tools/desktop-automation/prompt";
import { createCustomAgent } from "../service/agent";
import { saveChat } from "../service/chat";

const router = new Hono();

// Create agent endpoint
router.post(
  "/api/agents/create",
  zValidator("json", CreateAgentSchema),
  async (c) => {
    const {
      name,
      description,
      systemPrompt,
      toolReferences,
      modelId,
      iconUrl,
      avatar,
      category,
      type,
    } = c.req.valid("json");

    const formattedToolNames = toolReferences.map(
      (ref: ToolReference) => `${ref.toolName} (${ref.mcpName})`,
    );

    const agentData: Omit<AgentDefinition, "id"> = {
      name,
      description,
      toolReferences: toolReferences as ToolReference[],
      modelId,
      iconUrl,
      avatar,
      category: category || "Custom",
      type,
      systemPrompt:
        formattedToolNames.length > 0
          ? `${systemPrompt}\n\nAvailable tools: ${formattedToolNames.join(", ")}`
          : systemPrompt,
    };

    const agent = await createCustomAgent(agentData);
    await saveCustomAgent(agent);

    return c.json({
      status: "success",
      message: `Agent '${agent.name}' created successfully`,
      agent,
    });
  },
);

// Add endpoint for agent list
router.get("/api/agents", async (c) => {
  const agents = await getAgentList();
  return c.json({ status: "success", agents });
});

// Add endpoint for getting specific agent details
router.get("/api/agents/:agentId", async (c) => {
  const agentId = c.req.param("agentId");
  const agent = await getAgentById(agentId);

  if (!agent) {
    return c.json(
      { status: "error", message: `Agent with ID '${agentId}' not found` },
      404,
    );
  }

  return c.json({ status: "success", agent });
});

// Add endpoint for deleting an agent
router.delete("/api/agents/:agentId", async (c) => {
  const agentId = c.req.param("agentId");
  const success = await deleteCustomAgent(agentId);

  if (!success) {
    return c.json(
      {
        status: "error",
        message: `Agent with ID '${agentId}' not found or cannot be deleted`,
      },
      404,
    );
  }

  return c.json({
    status: "success",
    message: `Agent '${agentId}' deleted successfully`,
  });
});

// Update agent endpoint
router.put(
  "/api/agents/:agentId",
  zValidator("json", UpdateAgentSchema),
  async (c) => {
    const agentId = c.req.param("agentId");

    const {
      id,
      name,
      description,
      systemPrompt,
      toolReferences,
      modelId,
      iconUrl,
      avatar,
      category,
      type,
    } = c.req.valid("json");

    if (id !== agentId) {
      return c.json(
        {
          status: "error",
          message: "Agent ID mismatch between URL and request body",
        },
        400,
      );
    }

    const existingAgent = await getAgentById(agentId);
    if (!existingAgent) {
      return c.json(
        { status: "error", message: `Agent with ID '${agentId}' not found` },
        404,
      );
    }

    const finalToolReferences =
      toolReferences || existingAgent.toolReferences || [];
    const formattedToolNames = finalToolReferences.map(
      (ref: ToolReference) => `${ref.toolName} (${ref.mcpName})`,
    );

    // Handle systemPrompt update
    let updatedSystemPrompt: string;
    if (typeof systemPrompt === "string") {
      // If systemPrompt is explicitly provided, use it and append tools
      updatedSystemPrompt =
        formattedToolNames.length > 0
          ? `${systemPrompt}\n\nAvailable tools: ${formattedToolNames.join(", ")}`
          : systemPrompt;
    } else {
      // If systemPrompt is not provided, update the existing one with new tools
      const existingPrompt = existingAgent.systemPrompt || "";
      // Remove existing "Available tools:" section if it exists
      const basePrompt = existingPrompt
        .replace(/\n\nAvailable tools:.*$/, "")
        .trim();
      updatedSystemPrompt =
        formattedToolNames.length > 0
          ? `${basePrompt}\n\nAvailable tools: ${formattedToolNames.join(", ")}`
          : basePrompt;
    }

    const updatedAgent: AgentDefinition = {
      ...existingAgent,
      id: agentId,
      name: name || existingAgent.name,
      description: description || existingAgent.description,
      toolReferences: finalToolReferences as ToolReference[],
      modelId: modelId || existingAgent.modelId,
      iconUrl: iconUrl || existingAgent.iconUrl,
      avatar: avatar || existingAgent.avatar,
      category: category || existingAgent.category,
      type: type || existingAgent.type,
      systemPrompt: updatedSystemPrompt,
    };

    // saveCustomAgent handles updating existing agents automatically
    await saveCustomAgent(updatedAgent);
    return c.json({ status: "success", agent: updatedAgent });
  },
);

// Add schema for automation chat request
const AutomationChatSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
    }),
  ),
  modelId: z.string().optional(),
  chatId: z.string().optional(),
});

// Add automation endpoint
router.post(
  "/api/agent/automation",
  zValidator("json", AutomationChatSchema),
  async (c) => {
    const { messages, chatId } = c.req.valid("json");

    const anthropicApiKey = "";

    try {
      // Setup desktop automation tools
      const tools: ToolSet = {
        ...desktopAutomationTools,
      };

      // Get tool names for system prompt
      const toolsList = Object.keys(desktopAutomationTools);
      const systemPrompt = desktopAutomationPrompt;

      console.log(
        `Automation chat: Using ${toolsList.length} desktop automation tools`,
      );
      console.log(`Available tools: ${toolsList.join(", ")}`);

      // Create Anthropic model
      const anthropicProvider = createAnthropic({
        apiKey: anthropicApiKey,
      });
      const model = anthropicProvider("claude-sonnet-4-20250514");

      console.log("model", model);

      // Stream the response
      const result = streamText({
        model,
        messages: messages as Message[],
        system: systemPrompt,
        tools,
        maxSteps: 25,
        onFinish: async (response) => {
          console.log("Automation chat completed:", response);
          if (chatId) {
            await saveChat({
              id: chatId,
              messages: appendResponseMessages({
                messages: messages as Message[],
                responseMessages: response.response.messages,
              }),
            });
          }
        },
      });

      const headers = {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      };

      const response = result.toDataStreamResponse();

      if (!response.body) {
        return new Response(
          `data: ${JSON.stringify({ error: "No response body" })}\n\n`,
          { headers },
        );
      }

      return new Response(response.body, { headers });
    } catch (error) {
      console.error("Error in automation chat:", error);
      return c.json(
        {
          status: "error",
          message: `Automation chat failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
        500,
      );
    }
  },
);

export default router;
