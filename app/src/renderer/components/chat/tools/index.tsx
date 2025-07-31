import { ExecuteCommandRenderer } from "./execute-command";
import { WebSearchRenderer } from "./web-search";

/**
 * Special tool components mapping
 */
export const TOOL_COMPONENTS = {
  web_search: WebSearchRenderer,
  execute_command: ExecuteCommandRenderer,
} as const;
