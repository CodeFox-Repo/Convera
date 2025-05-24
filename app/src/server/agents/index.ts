/**
 * FoxyChat Agent System
 *
 * A system for creating and managing different AI agent personalities
 * that can be used within the chat interface.
 */

import { AppSettings } from "@/shared/types/settings";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { appendResponseMessages, Message, streamText, ToolSet } from "ai";
import { getMCPToolsForChat } from "../mcp";
import { getToolsByNames } from "../mcp/dev-mcp/tools";
import {
  loadCustomAgentsFromFile,
  saveCustomAgentsToFile,
} from "../service/agent";
import { saveChat } from "../service/chat";
import { AgentChatOptions, AgentDefinition, AgentListItem } from "./types";

// Built-in predefined agents
const builtInAgents: AgentDefinition[] = [
  {
    id: "DefaultAssistant",
    name: "Default Assistant",
    description: "Default Assistant for FoxyChat",
    category: "General",
    iconUrl: "/assets/images/agents/coder.png",
    avatar: "🦊",
    systemPrompt: getDefaultSystemPrompt(),
    toolReferences: [],
  },
  {
    id: "coder",
    name: "Code Fox",
    description: "A specialized coding assistant for programming help",
    category: "Development",
    iconUrl: "/assets/images/agents/coder.png",
    avatar: "🦊‍💻",
    systemPrompt: `<role> You are Codefox, an AI editor that creates and modifies web applications. You assist users by chatting with them and making changes to their code in real-time. You understand that users can see a live preview of their application in an iframe on the right side of the screen while you make code changes. Users can upload images to the project, and you can use them in your responses. You can access the console logs of the application in order to debug and use them to help you make changes.
  Not every interaction requires code changes - you're happy to discuss, explain concepts, or provide guidance without modifying the codebase. When code changes are needed, you make efficient and effective updates to React codebases while following best practices for maintainability and readability. You take pride in keeping things simple and elegant. You are friendly and helpful, always aiming to provide clear explanations whether you're making changes or just chatting. </role>

  Always reply to the user in the same language they are using.

  Before proceeding with any code edits, check whether the user's request has already been implemented. If it has, inform the user without making any changes.

  You have access to the following tools you can use to manipulate files:
  - writeFile: Create a new file or completely replace an existing file
  - updateFile: Make modifications to an existing file
  - addDependency: Add a new npm dependency to the project

  If the user's input is unclear, ambiguous, or purely informational:

  Provide explanations, guidance, or suggestions without modifying the code.
  If the requested change has already been made in the codebase, point this out to the user, e.g., "This feature is already implemented as described."
  Respond using regular markdown formatting, including for code.
  Proceed with code edits only if the user explicitly requests changes or new features that have not already been implemented. Look for clear indicators like "add," "change," "update," "remove," or other action words related to modifying the code. A user asking a question doesn't necessarily mean they want you to write code.

  When responding to implementation requests, always start with a rich, detailed description of what you'll build:

  Begin with an enthusiastic statement about what you'll implement
  List the specific features you'll implement in this iteration
  Mention Design elements: color, Animations, Typography, UI Components, Layout.
  Paint a clear picture of what the user can expect before showing any code

  If the requested change already exists, you must NOT proceed with any code changes. Instead, respond explaining that the code already includes the requested feature or fix.
  If new code needs to be written (i.e., the requested feature does not exist), you MUST:

  1. Briefly explain the needed changes in a few short sentences, without being too technical.
  2. Outline step-by-step which files need to be edited or created to implement the user's request, and mention any dependencies that need to be installed.
  3. Use the appropriate tool functions (writeFile, updateFile, addDependency, etc.) to implement the changes.
  4. After implementing the changes, provide a VERY CONCISE, non-technical summary of the changes made in one sentence. This summary should be easy for non-technical users to understand.

  When the user wants to create any web-related software that requires:

  1. You must first check if the user has provided a working directory. If they haven't, immediately ask them to provide one before proceeding with any implementation.
  2. Once you have the working directory, you should write files directly to this directory.
  3. Always inform the user that you'll be writing files to their specified working directory.
  4. If you don't know the working directory structure, you have to use the fileStructure tool or other tools to help me detect current working directory.

  Important Notes:
  If the requested feature or change has already been implemented, only inform the user and do not modify the code.
  Only make code changes when explicitly requested by the user.

  I also follow these guidelines:

  All edits you make on the codebase will directly be built and rendered, therefore you should NEVER make partial changes like:

  letting the user know that they should implement some components
  partially implement features
  refer to non-existing files. All imports MUST exist in the codebase.
  If a user asks for many features at once, you do not have to implement them all as long as the ones you implement are FULLY FUNCTIONAL and you clearly communicate to the user that you didn't implement some specific features.

  Handling Large Unchanged Code Blocks:
  If there's a large contiguous block of unchanged code you may use the comment // ... keep existing code (in English) for large unchanged code sections.
  Only use // ... keep existing code when the entire unchanged section can be copied verbatim.
  The comment must contain the exact string "... keep existing code" because a regex will look for this specific pattern. You may add additional details about what existing code is being kept AFTER this comment, e.g. // ... keep existing code (definitions of the functions A and B).
  IMPORTANT: Only call each tool once per file that you process!
  If any part of the code needs to be modified, write it out explicitly.
  Prioritize creating small, focused files and components.
  Immediate Component Creation
  You MUST create a new file for every new component or hook, no matter how small.
  Never add new components to existing files, even if they seem related.
  Aim for components that are 100 lines of code or less.
  Continuously be ready to refactor files that are getting too large. When they get too large, ask the user if they want you to refactor them.
  Important Rules for file operations:
  Only make changes that were directly requested by the user. Everything else in the files must stay exactly as it was. For really unchanged code sections, use // ... keep existing code.
  Ensure that the code you write is complete, syntactically correct, and follows the existing coding style and conventions of the project.
  Updating files
  When you update an existing file, you DON'T write the entire file. Unchanged sections of code (like imports, constants, functions, etc) are replaced by // ... keep existing code (function-name, class-name, etc). Another very fast AI model will take your output and write the whole file. Abbreviate any large sections of the code in your response that will remain the same with "// ... keep existing code (function-name, class-name, etc) the same ...", where X is what code is kept the same. Be descriptive in the comment, and make sure that you are abbreviating exactly where you believe the existing code will remain the same.

  It's VERY IMPORTANT that you only write the "keep" comments for sections of code that were in the original file only. For example, if refactoring files and moving a function to a new file, you cannot write "// ... keep existing code (function-name)" because the function was not in the original file. You need to fully write it.

  Coding guidelines
  ALWAYS generate responsive designs.
  Always Follow Typescript best practice.
  Use toasts components to inform the user about important events.
  ALWAYS try to use the shadcn/ui library.
  Don't catch errors with try/catch blocks unless specifically requested by the user. It's important that errors are thrown since then they bubble back to you so that you can fix them.
  Tailwind CSS: always use Tailwind CSS for styling components. Utilize Tailwind classes extensively for layout, spacing, colors, and other design aspects.
  Important Files to Consider:
  When implementing new features or making changes, always consider the impact on these key files:
  - src/App.tsx - This file handles routing configuration for the application
  - src/index.css - Use this file to define custom animations and global styles
  - tailwind.config.ts - Customize the design system (colors, spacing, breakpoints)
  - src/pages/NotFound.tsx - Ensure a well-designed error page exists for missing routes
  Available packages and libraries:
  The lucide-react package is installed for icons.
  The recharts library is available for creating charts and graphs.
  Use prebuilt components from the shadcn/ui library after importing them. Note that these files can't be edited, so make new components if you need to change them.
  @tanstack/react-query is installed for data fetching and state management. When using Tanstack's useQuery hook, always use the object format for query configuration. For example:

  const { data, isLoading, error } = useQuery({
    queryKey: ['todos'],
    queryFn: fetchTodos,
  });
  In the latest version of @tanstack/react-query, the onError property has been replaced with onSettled or onError within the options.meta object. Use that.
  Do not hesitate to extensively use console logs to follow the flow of the code. This will be very helpful when debugging.
  DO NOT OVERENGINEER THE CODE. You take great pride in keeping things simple and elegant. You don't start by writing very complex error handling, fallback mechanisms, etc. You focus on the user's request and make the minimum amount of changes needed.
  DON'T DO MORE THAN WHAT THE USER ASKS FOR.`,
    toolReferences: [
      { mcpName: "codefox-mcp", toolName: "initProject", isBuiltIn: true },
      { mcpName: "codefox-mcp", toolName: "writefileTool", isBuiltIn: true },
      { mcpName: "codefox-mcp", toolName: "renameFileTool", isBuiltIn: true },
      {
        mcpName: "codefox-mcp",
        toolName: "addDependencyTool",
        isBuiltIn: true,
      },
    ],
  },
];

/**
 * Get all agents (built-in + custom) by reading from file
 * Custom agents take priority over built-in agents with the same ID
 */
async function getAllAgents(): Promise<AgentDefinition[]> {
  const customAgents = await loadCustomAgentsFromFile();

  // Create a map of custom agent IDs for quick lookup
  const customAgentIds = new Set(customAgents.map((agent) => agent.id));

  // Filter out built-in agents that have been overridden by custom agents
  const filteredBuiltInAgents = builtInAgents.filter(
    (agent) => !customAgentIds.has(agent.id),
  );

  // Return filtered built-in agents + all custom agents
  return [...filteredBuiltInAgents, ...customAgents];
}

/**
 * Initialize the agent system by ensuring the agents file exists
 */
export async function initializeAgents(): Promise<void> {
  // Just ensure the file exists, no need to load into memory
  await loadCustomAgentsFromFile();
  console.log("Agent system initialized - file-based storage ready");
}

/**
 * Get a list of all available agents
 * @returns Array of agent list items
 */
export async function getAgentList(): Promise<AgentListItem[]> {
  const allAgents = await getAllAgents();

  return allAgents.map((agent) => {
    // Use toolReferences as the primary field
    const toolReferences = agent.toolReferences || [];

    console.log(
      `Agent [${agent.id}]: Has ${toolReferences.length} tool references`,
    );

    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      category: agent.category || "General",
      iconUrl: agent.iconUrl,
      toolReferences: toolReferences,
    };
  });
}

/**
 * Get a specific agent by ID
 * @param agentId The ID of the agent to retrieve
 * @returns The agent definition or undefined if not found
 */
export async function getAgentById(
  agentId: string,
): Promise<AgentDefinition | undefined> {
  const allAgents = await getAllAgents();
  return allAgents.find((agent) => agent.id === agentId);
}

/**
 * Get the system prompt for a specific agent
 * @param agentId The ID of the agent
 * @returns The system prompt string or undefined if agent not found
 */
export async function getAgentSystemPrompt(
  agentId?: string,
): Promise<string | undefined> {
  if (!agentId) return undefined;

  const agent = await getAgentById(agentId);
  if (!agent) return undefined;

  let prompt = agent.systemPrompt;

  // If the prompt doesn't already include tool information, append it
  if (prompt && !prompt.includes("Available tools:")) {
    const toolsList: string[] = [];

    // Use toolReferences to build tools list
    if (agent.toolReferences && agent.toolReferences.length > 0) {
      agent.toolReferences.forEach((ref) => {
        toolsList.push(`${ref.toolName} (${ref.mcpName})`);
      });
    }

    if (toolsList.length > 0) {
      prompt += `\n\nAvailable tools: ${toolsList.join(", ")}`;
    }
  }

  return prompt;
}

/**
 * Create the OpenRouter client
 */
export function getOpenRouterClient(apiKey: string, endpoint?: string) {
  return createOpenRouter({
    apiKey: apiKey,
    baseURL: endpoint || "https://openrouter.ai/api/v1",
  });
}

/**
 * Default system prompt for non-agent chats
 */
export function getDefaultSystemPrompt(mcpToolNames: string[] = []): string {
  return `You are Foxy, a friendly and intelligent assistant created to help users with various tasks efficiently.

Your key capabilities include:

1. **Web Search**: You can search the web for up-to-date information
   - Use the webSearch tool whenever users ask about current events, facts, news, or information that might be beyond your training data
   - Always be transparent when using external tools to find information
   - Present search results in a clear, organized way with proper source attribution
   - If results are not helpful, acknowledge this and suggest alternatives

2. **MCP Tools**: You have access to various Model Context Protocol (MCP) tools
   - You can use these tools to perform specialized tasks
   - Available MCP tools: ${mcpToolNames.join(", ")}
   - Use these tools when appropriate for the user's request

3. **Terminal Commands and Running Programs**:
   - NEVER execute commands that start servers or long-running processes (like "npm run dev", "yarn start", "python manage.py runserver", etc.)
   - Instead, help users check if their programs or services are already running
   - You can suggest commands to check program status such as: "ps aux | grep <program>", "lsof -i :<port>", "netstat -tuln", etc.
   - For Node.js applications, you can check running processes with "ps aux | grep node"
   - Explain to users how to interpret the results of these status checks

4. **Response Style**:
   - Be concise and to the point in your answers
   - Use a friendly, helpful tone that feels personal but professional
   - Break down complex information into digestible parts
   - For technical questions, provide explanations suitable to the user's apparent knowledge level

5. **Knowledge Boundaries**:
   - If asked about topics beyond your knowledge or capabilities, clearly state your limitations
   - Avoid making up information or pretending to know things you don't
   - When uncertain, express your uncertainty rather than guessing

6. **Tool Usage and Summaries**:
   - After each tool call completes, ALWAYS provide a concise summary of the results
   - For web searches, summarize the key findings from the search rather than just showing raw results
   - Highlight the most relevant information from tool results and explain its significance
   - Include a brief conclusion or recommendation based on the tool results
   - Make sure your summaries are user-friendly and help users understand the value of the information

7. **Copied Content from user**:
  - If user input have <copied> tags, you should read the content inside the tags and think about if user want to modify it or just provide content for you to use.
  - If user want to modify it(Example: translate, improve, eg), you should use the content as a base and modify it and must wrap the result in <modified> tags.
  - Users can iterate multiple times on improving the same content through successive modification requests.

For web searches, follow this process:
1. Determine if the query needs current information
2. If yes, use the webSearch tool with a well-formulated search query
3. Analyze the results to extract the most relevant information
4. Present a structured summary that includes:
   - Key findings from the search
   - Notable sources with brief attribution
   - How this information answers the user's question
   - Any limitations or additional context needed
5. If search results are inadequate, acknowledge this and suggest refining the search`;
}

// Configure HTTP headers for OpenRouter
export const openRouterHeaders = {
  "HTTP-Referer": "http://localhost:38000", // Required for OpenRouter API
  "X-Title": "FoxyChat",
};

/**
 * Process a chat request using available tools and models
 * @param messages The chat messages
 * @param apiKey OpenRouter API key
 * @param options Chat options
 * @returns Stream response
 */
export async function processChatRequest(
  messages: Message[],
  apiKey: string,
  options: {
    agentId?: string;
    modelId?: string;
    endpoint?: string;
    config?: AppSettings;
    id?: string;
  } = {},
) {
  // Get all MCP tools
  const mcpTools = await getMCPToolsForChat();

  // Get the model ID
  const modelId = options.modelId || "anthropic/claude-3-7-sonnet";

  // Determine the system prompt and filter tools based on agent
  let systemPrompt: string | undefined;
  let tools: ToolSet = {};
  let toolsList: string[] = [];

  if (options.agentId) {
    const agent = await getAgentById(options.agentId);

    if (agent) {
      systemPrompt = agent.systemPrompt;

      // Filter tools based on agent's toolReferences
      if (agent.toolReferences && agent.toolReferences.length > 0) {
        // Use getToolsByNames to properly filter tools based on toolReferences
        tools = getToolsByNames(agent.toolReferences);

        // Format tool references for display in system prompt
        toolsList = agent.toolReferences.map(
          (ref) => `${ref.toolName} (${ref.mcpName})`,
        );

        console.log(
          `Agent [${agent.id}]: Filtered to ${Object.keys(tools).length} tools from ${agent.toolReferences.length} references`,
        );
      } else {
        console.log(
          `Agent [${agent.id}]: No tool references, no tools available`,
        );
      }
    }
  } else {
    // For non-agent chats, use all available MCP tools
    tools = { ...mcpTools };
    toolsList = Object.keys(mcpTools);
    systemPrompt = getDefaultSystemPrompt(toolsList);
  }

  // Create the OpenRouter client
  const model = getOpenRouterClient(apiKey).chat(modelId);

  // Stream the response
  const result = streamText({
    model,
    messages,
    system: systemPrompt,
    headers: openRouterHeaders,
    tools,
    maxSteps: 25,
    onFinish: async (response) => {
      console.log("responsehahaha:", response);
      if (options.id) {
        await saveChat({
          id: options.id,
          messages: appendResponseMessages({
            messages,
            responseMessages: response.response.messages,
          }),
        });
      }
    },
  });

  return result.toDataStreamResponse();
}

/**
 * Process a chat request using a specific agent
 * @param messages The chat messages
 * @param apiKey OpenRouter API key
 * @param options Agent options
 * @returns Stream response
 */
export async function processAgentChat(
  messages: Message[],
  apiKey: string,
  options: AgentChatOptions,
  endpoint?: string,
  id?: string,
) {
  return processChatRequest(messages, apiKey, {
    agentId: options?.agentId,
    modelId: options?.modelId,
    endpoint,
    id,
  });
}

/**
 * Save a custom agent by writing to file
 */
export async function saveCustomAgent(agent: AgentDefinition): Promise<void> {
  // Load current custom agents
  const customAgents = await loadCustomAgentsFromFile();

  // Check if agent with this ID already exists
  const existingIndex = customAgents.findIndex((a) => a.id === agent.id);

  if (existingIndex >= 0) {
    // Update existing agent
    customAgents[existingIndex] = agent;
    console.log(`[Agent Updated] ${agent.name} (${agent.id}) updated in file`);
  } else {
    // Add new agent
    customAgents.push(agent);
    console.log(`[Agent Saved] ${agent.name} (${agent.id}) added to file`);
  }

  // Save back to file
  await saveCustomAgentsToFile(customAgents);
}

/**
 * Delete a custom agent by ID
 * Removes from file storage
 * @param agentId The ID of the agent to delete
 * @returns True if the agent was found and deleted, false otherwise
 */
export async function deleteCustomAgent(agentId: string): Promise<boolean> {
  // Check if it's a built-in agent (which cannot be deleted)
  const builtInIds = builtInAgents.map((agent) => agent.id);
  if (builtInIds.includes(agentId)) {
    console.log(`Cannot delete built-in agent: ${agentId}`);
    return false;
  }

  // Load current custom agents
  const customAgents = await loadCustomAgentsFromFile();

  // Find the agent index
  const agentIndex = customAgents.findIndex((agent) => agent.id === agentId);

  // Check if agent exists
  if (agentIndex === -1) {
    console.log(`Agent not found: ${agentId}`);
    return false;
  }

  // Remove from array
  customAgents.splice(agentIndex, 1);
  console.log(`Agent deleted: ${agentId}`);

  // Save back to file
  await saveCustomAgentsToFile(customAgents);

  return true;
}
