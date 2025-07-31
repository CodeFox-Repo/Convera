import { ExecuteCommandRenderer } from "./execute-command";
import { WebSearchRenderer } from "./web-search";
import { WebFetchRenderer } from "./web-fetch";

/**
 * Special tool components mapping
 */
export const TOOL_COMPONENTS = {
  web_search: WebSearchRenderer,
  web_fetch: WebFetchRenderer,
  execute_command: ExecuteCommandRenderer,
} as const;
