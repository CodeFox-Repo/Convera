/**
 * Convera Agent Tools - Ask User Input
 *
 * Client-side tool that allows AI to ask users for input with predefined options.
 * This is a blocking tool - AI pauses until user responds.
 */

import { tool } from "ai";
import { z } from "zod";

/**
 * Ask user input tool
 *
 * This tool is handled specially in the frontend:
 * - The execute function is a placeholder (never called directly)
 * - Actual execution happens in chat-store.tsx onToolCall handler
 * - Uses deferred Promise pattern to block until user responds
 */
export const askUserInput = tool({
  description:
    "Ask the user to select from predefined options or provide custom input. Use this when you need user clarification or a choice before proceeding.",
  inputSchema: z.object({
    question: z.string().describe("The question to ask the user"),
    options: z
      .array(z.string())
      .max(3)
      .describe("Up to 3 predefined options for the user to choose from"),
  }),
  execute: async ({ question, options }) => {
    // This is a client-side tool - execution happens in renderer process
    // This execute function should never be called directly by the main process
    // It's here for schema completeness
    return {
      _clientSideTool: true,
      question,
      options,
      message: "Waiting for user input...",
    };
  },
});
