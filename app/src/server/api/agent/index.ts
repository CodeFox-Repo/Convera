import express, { Request, RequestHandler, Response } from "express";
import {
  deleteCustomAgent,
  getAgentById,
  getAgentList,
  saveCustomAgent,
} from "../../agents";
import { AgentDefinition, ToolReference } from "../../agents/types";
import { createCustomAgent } from "../../service/agent";

const router = express.Router();

// Create new agent
router.post("/create", (async (req: Request, res: Response) => {
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

  if (!name || !description || !systemPrompt) {
    return res.status(400).json({
      status: "error",
      message:
        "Missing required fields: name, description, and systemPrompt are required",
    });
  }

  if (!toolReferences || !Array.isArray(toolReferences)) {
    return res.status(400).json({
      status: "error",
      message: "toolReferences must be provided as an array",
    });
  }

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
}) as RequestHandler);

// Get all agents
router.get("/", async (req: Request, res: Response) => {
  const agents = await getAgentList();
  res.json({ status: "success", agents });
});

// Create agent from template
router.post("/create-from-template", async (req: Request, res: Response) => {
  const { templateId, customizations } = req.body;

  if (!templateId) {
    res.status(400).json({
      status: "error",
      message: "Template ID is required",
    });
    return;
  }

  try {
    // Get the template agent
    const templateAgent = await getAgentById(templateId);
    if (!templateAgent) {
      res.status(404).json({
        status: "error",
        message: "Template agent not found",
      });
      return;
    }

    // Create new agent based on template with customizations
    const newAgentData: Omit<AgentDefinition, "id"> = {
      ...templateAgent,
      name: customizations?.name || `${templateAgent.name} (Copy)`,
      description: customizations?.description || templateAgent.description,
      systemPrompt: customizations?.systemPrompt || templateAgent.systemPrompt,
      category: "Custom", // Always set to Custom for user-created agents
      type: "custom",
    };

    const newAgent = await createCustomAgent(newAgentData);
    await saveCustomAgent(newAgent);

    res.status(200).json({
      status: "success",
      message: `Agent '${newAgent.name}' created from template successfully`,
      agent: newAgent,
    });
  } catch (error) {
    console.error("Error creating agent from template:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to create agent from template",
    });
  }
});

// Get specific agent by ID
router.get("/:agentId", async (req: Request, res: Response) => {
  const { agentId } = req.params;
  const agent = await getAgentById(agentId);

  if (!agent) {
    res.status(404).json({
      status: "error",
      message: "Agent not found",
    });
    return;
  }

  res.json({ status: "success", agent });
});

// Delete specific agent by ID
router.delete("/:agentId", async (req: Request, res: Response) => {
  const { agentId } = req.params;

  try {
    await deleteCustomAgent(agentId);
    res.json({
      status: "success",
      message: "Agent deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting agent:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to delete agent",
    });
  }
});

// Update specific agent by ID
router.put("/:agentId", async (req: Request, res: Response) => {
  const { agentId } = req.params;
  const {
    name,
    description,
    systemPrompt,
    toolReferences,
    modelId,
    iconUrl,
    avatar,
    category,
  } = req.body;

  try {
    // Get existing agent
    const existingAgent = await getAgentById(agentId);
    if (!existingAgent) {
      res.status(404).json({
        status: "error",
        message: "Agent not found",
      });
      return;
    }

    // Validate required fields
    if (!name || !description || !systemPrompt) {
      res.status(400).json({
        status: "error",
        message:
          "Missing required fields: name, description, and systemPrompt are required",
      });
      return;
    }

    if (!toolReferences || !Array.isArray(toolReferences)) {
      res.status(400).json({
        status: "error",
        message: "toolReferences must be provided as an array",
      });
      return;
    }

    const formattedToolNames = toolReferences.map(
      (ref: ToolReference) => `${ref.toolName} (${ref.mcpName})`,
    );

    // Update agent data
    const updatedAgentData: AgentDefinition = {
      ...existingAgent,
      name,
      description,
      toolReferences,
      modelId,
      iconUrl,
      avatar,
      category: category || existingAgent.category,
      systemPrompt:
        formattedToolNames.length > 0
          ? `${systemPrompt}\n\nAvailable tools: ${formattedToolNames.join(", ")}`
          : systemPrompt,
    };

    await saveCustomAgent(updatedAgentData);

    res.json({
      status: "success",
      message: `Agent '${updatedAgentData.name}' updated successfully`,
      agent: updatedAgentData,
    });
  } catch (error) {
    console.error("Error updating agent:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to update agent",
    });
  }
});

export default router;
