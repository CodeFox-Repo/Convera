/**
 * Convera Agent Tools
 *
 * Collection of AI SDK tools for agent functionality
 */

import { askUserInput } from "./ask-user-input";
import { executeCommand } from "./execute-command";
import { webFetch } from "./web-fetch";

export const builtinTools = {
  askUserInput,
  executeCommand,
  webFetch,
};

/**
 * Builtin tools registry - simple name to tool mapping
 * This is used by the MCP hub for tool resolution
 */
export const BUILTIN_TOOLS_REGISTRY = {
  ask_user_input: askUserInput,
  execute_command: executeCommand,
  web_fetch: webFetch,
} as const;
