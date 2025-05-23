import fs from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { AgentDefinition } from "../agents/types";

const agentDir = path.join(os.homedir(), ".foxychat");
const AGENTS_CONFIG_PATH = path.join(agentDir, "agents.json");

/**
 * Ensure the agent directory exists
 */
async function ensureAgentDirectory(): Promise<void> {
  if (!fs.existsSync(agentDir)) {
    await mkdir(agentDir, { recursive: true });
  }
}

/**
 * Load custom agents from file
 */
export async function loadCustomAgentsFromFile(): Promise<AgentDefinition[]> {
  try {
    await ensureAgentDirectory();

    if (!fs.existsSync(AGENTS_CONFIG_PATH)) {
      // Create empty file for future use
      await writeFile(AGENTS_CONFIG_PATH, JSON.stringify([], null, 2));
      return [];
    }

    const data = await readFile(AGENTS_CONFIG_PATH, "utf8");
    const customAgents = JSON.parse(data) as AgentDefinition[];

    // Validate the loaded data
    if (!Array.isArray(customAgents)) {
      console.warn("Invalid agents file format, resetting to empty array");
      await writeFile(AGENTS_CONFIG_PATH, JSON.stringify([], null, 2));
      return [];
    }

    console.log(
      `Loaded ${customAgents.length} custom agents from ${AGENTS_CONFIG_PATH}`,
    );
    return customAgents;
  } catch (error) {
    console.error("Error loading custom agents:", error);
    return [];
  }
}

/**
 * Save custom agents to file
 */
export async function saveCustomAgentsToFile(
  customAgents: AgentDefinition[],
): Promise<void> {
  try {
    await ensureAgentDirectory();

    // Validate input
    if (!Array.isArray(customAgents)) {
      throw new Error("Invalid agents data: expected array");
    }

    const content = JSON.stringify(customAgents, null, 2);
    await writeFile(AGENTS_CONFIG_PATH, content);

    console.log(
      `Saved ${customAgents.length} custom agents to ${AGENTS_CONFIG_PATH}`,
    );
  } catch (error) {
    console.error("Error saving custom agents:", error);
    throw error;
  }
}

/**
 * Validate agent definition
 */
export function validateAgentDefinition(
  agent: Partial<AgentDefinition>,
): agent is AgentDefinition {
  return !!(
    agent.id &&
    agent.name &&
    agent.description &&
    agent.systemPrompt &&
    typeof agent.id === "string" &&
    typeof agent.name === "string" &&
    typeof agent.description === "string" &&
    typeof agent.systemPrompt === "string"
  );
}

/**
 * Create a new agent with validation
 */
export async function createCustomAgent(
  agentData: Omit<AgentDefinition, "id">,
): Promise<AgentDefinition> {
  const newAgent: AgentDefinition = {
    ...agentData,
    id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    toolReferences: agentData.toolReferences || [],
    category: agentData.category || "Custom",
  };

  if (!validateAgentDefinition(newAgent)) {
    throw new Error("Invalid agent definition");
  }

  return newAgent;
}

/**
 * Get the agents storage file path
 */
export function getAgentsStoragePath(): string {
  return AGENTS_CONFIG_PATH;
}
