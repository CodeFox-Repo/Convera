import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
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
import { createCustomAgent } from "../service/agent";

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
      updatedSystemPrompt = systemPrompt;
    } else {
      // If systemPrompt is not provided, use the original system prompt
      const existingPrompt = existingAgent.systemPrompt || "";
      updatedSystemPrompt = existingPrompt;
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

export default router;
