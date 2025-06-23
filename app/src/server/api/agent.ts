import { zValidator } from "@hono/zod-validator";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import {
  appendResponseMessages,
  CoreMessage,
  Message,
  streamText,
  tool,
  ToolSet,
} from "ai";
import * as child_process from "child_process";
import * as fs from "fs";
import type { Context } from "hono";
import { Hono } from "hono";
import * as os from "os";
import * as path from "path";
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
import { authenticateRequest } from "./chat";

// Add interface for context with apiToken
interface AuthenticatedContext extends Context {
  apiToken: string;
}

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
  id: z.string().optional(),
});

// Helper to convert messages to CoreMessage format for AI SDK
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertToAISDKFormat(messages: any[]): CoreMessage[] {
  return messages.map((msg) => {
    if (msg.content && Array.isArray(msg.content)) {
      return {
        ...msg,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        content: msg.content.map((part: any) => {
          if (part.type === "image_url") {
            return {
              type: "image",
              image: part.image_url.url,
            };
          }
          return part;
        }),
      };
    }
    return msg;
  });
}

// Add automation endpoint
router.post(
  "/api/agent/automation",
  authenticateRequest,
  zValidator("json", AutomationChatSchema),
  async (c) => {
    const { messages, id } = c.req.valid("json");

    const apiKey = (c as unknown as AuthenticatedContext).apiToken;

    const openrouter = createOpenRouter({
      apiKey,
    });

    const chatModel = openrouter.chat("anthropic/claude-3-7-sonnet");

    try {
      // Setup desktop automation tools and add custom computer tool
      const tools: ToolSet = {
        ...desktopAutomationTools,
        screenshot: tool({
          description: "Take a screenshot",
          parameters: z.object({
            mode: z
              .enum(["full", "window"])
              .optional()
              .describe("Screenshot mode: full screen or active window"),
            coordinate: z
              .array(z.number())
              .optional()
              .describe("Optional coordinates for actions"),
            text: z.string().optional().describe("Optional text for actions"),
          }),
          execute: async ({ mode }) => {
            try {
              console.log("[Tool Result: Capturing screenshot...]");

              // Create screenshot using the same approach as the existing screenshot tool
              const filePath = path.join(
                os.tmpdir(),
                `computer_screenshot_${Date.now()}.png`,
              );

              // Capture real screenshot using macOS screencapture
              if (mode === "window") {
                // Try to capture active window
                child_process.execSync(`screencapture -x -W "${filePath}"`);
              } else {
                // Default to full screen
                child_process.execSync(`screencapture -x -D1 "${filePath}"`);
              }

              if (!fs.existsSync(filePath)) {
                throw new Error(
                  `Screenshot file was not created at ${filePath}`,
                );
              }

              // Read the image and convert to base64
              const imageBuffer = fs.readFileSync(filePath);
              const base64 = imageBuffer.toString("base64");
              const dataURL = `${base64}`;

              console.log("[Tool Result: Screenshot captured successfully]");

              // Add the image in OpenRouter format to our messages array
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (messages as any[]).push({
                role: "user",
                content: [
                  {
                    type: "text",
                    text: "Here is the current screenshot:",
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: dataURL,
                    },
                  },
                ],
              });

              // Clean up temporary file
              try {
                fs.unlinkSync(filePath);
                console.log("[Temporary file cleaned up]");
              } catch (cleanupError) {
                console.warn(
                  `[Warning: Could not clean up temporary file: ${cleanupError}]`,
                );
              }

              return "Screenshot captured and added to conversation";
            } catch (error) {
              console.log(
                `[Tool Result: Failed to capture screenshot: ${error}]`,
              );
              return `Failed to capture screenshot: ${error}`;
            }
          },
        }),
      };

      // Get tool names for system prompt
      const toolsList = Object.keys(tools);
      const systemPrompt = desktopAutomationPrompt;

      console.log(
        `Automation chat: Using ${toolsList.length} tools including custom computer tool`,
      );
      console.log(`Available tools: ${toolsList.join(", ")}`);

      // Stream the response
      const result = streamText({
        model: chatModel,
        messages: convertToAISDKFormat(messages),
        system: systemPrompt,
        tools,
        maxSteps: 25,
        onFinish: async (response) => {
          console.log("Automation chat completed:", response);
          if (id) {
            console.log("Saving chat:", id);
            await saveChat({
              id,
              messages: appendResponseMessages({
                messages: messages as Message[],
                responseMessages: response.response.messages,
              }),
            });
          }
        },
      });

      let needsFollowUp = false;
      let followUpConfig = { prompt: "", logMessage: "" };

      const stream = result.fullStream;
      for await (const part of stream) {
        if (part.type === "text-delta") {
          process.stdout.write(part.textDelta);
        } else if (part.type === "tool-call") {
          console.log(`\n[Executing tool: ${part.toolName}]`);

          // Configure follow-up based on tool and action
          if (part.toolName === "screenshot") {
            needsFollowUp = true;
            followUpConfig = {
              prompt:
                "Please analyze this screenshot in detail. What do you see? What's happening on the screen?",
              logMessage: "[Auto-analyzing screenshot...]",
            };
          }
          // Add more tool-specific follow-up configurations here as needed
          // Example: if (part.toolName === "someOtherTool") { ... }
        }
      }

      if (needsFollowUp) {
        await sendFollowUpRequest(
          followUpConfig.prompt,
          followUpConfig.logMessage,
          messages,
          chatModel,
        );
      }

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

// Generic helper function to automatically send follow-up requests
async function sendFollowUpRequest(
  followUpPrompt?: string,
  logMessage?: string,
  messages?: CoreMessage[],
  chatModel?: LanguageModel,
) {
  if (!messages || !chatModel) {
    console.error("Missing required parameters for follow-up request");
    return;
  }

  const defaultPrompt =
    "Please analyze or provide more details about what was just processed.";
  const prompt = followUpPrompt || defaultPrompt;
  const log = logMessage || "[Auto-processing follow-up request...]";

  console.log(`\n${log}`);

  // Add the follow-up request to messages
  messages.push({
    role: "user",
    content: prompt,
  });

  const result = streamText({
    model: chatModel,
    maxSteps: 5,
    messages: convertToAISDKFormat(messages),
  });

  let fullResponse = "";
  process.stdout.write("\nAssistant: ");

  // Handle the follow-up response
  const stream = result.fullStream;
  for await (const part of stream) {
    if (part.type === "text-delta") {
      fullResponse += part.textDelta;
      process.stdout.write(part.textDelta);
    }
  }

  process.stdout.write("\n\n");

  // Store the assistant's follow-up response
  if (fullResponse.trim()) {
    messages.push({
      role: "assistant",
      content: fullResponse,
    });
  }
}

export default router;
