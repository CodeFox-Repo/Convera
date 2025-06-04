import express, { Request, RequestHandler, Response } from "express";
import {
  createAgentSchema,
  updateAgentSchema,
  ToolReference,
  CreateAgentInput,
  UpdateAgentInput,
} from "../agents/types";
import { validateBody } from "../middleware/validation";
import {
  deleteCustomAgent,
  getAgentById,
  getAgentList,
  saveCustomAgent,
} from "../agents";
import { AgentDefinition } from "../agents/types";
import { createCustomAgent } from "../service/agent";

const router = express.Router();

router.post(
  "/api/agents/create",
  validateBody(createAgentSchema),
  (async (
    req: Request<{}, any, CreateAgentInput>,
    res: Response,
  ) => {
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
    } = req.body;

  const formattedToolNames = toolReferences.map(
    (ref: ToolReference) => `${ref.toolName} (${ref.mcpName})`,
  );

  const agentData: Omit<AgentDefinition, "id"> = {
    name,
    description,
    toolReferences,
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

  res.status(200).json({
    status: "success",
    message: `Agent '${agent.name}' created successfully`,
    agent,
  });
}) as RequestHandler<{}, any, CreateAgentInput>);

// Add endpoint for agent list
router.get("/api/agents", async (req: Request, res: Response) => {
  const agents = await getAgentList();
  res.json({ status: "success", agents });
});

// Add endpoint for getting specific agent details
router.get("/api/agents/:agentId", async (req: Request, res: Response) => {
  const { agentId } = req.params;
  const agent = await getAgentById(agentId);

  if (!agent) {
    res.status(404).json({
      status: "error",
      message: `Agent with ID '${agentId}' not found`,
    });
    return;
  }

  res.json({ status: "success", agent });
});

// Add endpoint for deleting an agent
router.delete("/api/agents/:agentId", async (req: Request, res: Response) => {
  const { agentId } = req.params;
  const success = await deleteCustomAgent(agentId);

  if (!success) {
    res.status(404).json({
      status: "error",
      message: `Agent with ID '${agentId}' not found or cannot be deleted`,
    });
    return;
  }

  res.json({
    status: "success",
    message: `Agent '${agentId}' deleted successfully`,
  });
});

// Add endpoint for updating an agent
router.put(
  "/api/agents/:agentId",
  validateBody(updateAgentSchema),
  async (
    req: Request<{ agentId: string }, any, UpdateAgentInput>,
    res: Response,
  ) => {
    const { agentId } = req.params;
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
    } = req.body;

  if (id !== agentId) {
    res.status(400).json({
      status: "error",
      message: "Agent ID mismatch between URL and request body",
    });
    return;
  }

  const existingAgent = await getAgentById(agentId);
  if (!existingAgent) {
    res.status(404).json({
      status: "error",
      message: `Agent with ID '${agentId}' not found`,
    });
    return;
  }

  const finalToolReferences =
    toolReferences || existingAgent.toolReferences || [];
  const formattedToolNames = finalToolReferences.map(
    (ref: ToolReference) => `${ref.toolName} (${ref.mcpName})`,
  );

  const updatedAgent: AgentDefinition = {
    ...existingAgent,
    id: agentId,
    name: name || existingAgent.name,
    description: description || existingAgent.description,
    toolReferences: finalToolReferences,
    modelId: modelId || existingAgent.modelId,
    iconUrl: iconUrl || existingAgent.iconUrl,
    avatar: avatar || existingAgent.avatar,
    category: category || existingAgent.category,
    type: type || existingAgent.type,
    systemPrompt:
      typeof systemPrompt === "string"
        ? `${systemPrompt}\n\nAvailable tools: ${formattedToolNames.join(", ")}`
        : existingAgent.systemPrompt,
  };

  const deleteSuccess = await deleteCustomAgent(agentId);
  if (!deleteSuccess) {
    res.status(500).json({
      status: "error",
      message: "Failed to update agent: could not remove old version",
    });
    return;
  }

  await saveCustomAgent(updatedAgent);
  res.json({ status: "success", agent: updatedAgent });
});

export default router;
