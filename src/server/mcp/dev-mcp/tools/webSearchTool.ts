/**
 * FoxyFox Agent Tools
 *
 * This module contains tools that can be used by AI agents in the chat system.
 */

import { tool } from "ai";
import { z } from "zod";

// Define web search tool
export const webSearch = tool({
  description: "Search the web for current information on any topic",
  parameters: z.object({
    query: z.string().describe("The search query to look up information about"),
    max_results: z
      .number()
      .min(1)
      .max(10)
      .default(5)
      .describe(
        "Maximum number of search results to return (default: 5, max: 10)",
      ),
    include_domains: z
      .array(z.string())
      .optional()
      .describe("Optional list of domains to include in the search"),
    exclude_domains: z
      .array(z.string())
      .optional()
      .describe("Optional list of domains to exclude from the search"),
    search_depth: z
      .enum(["basic", "advanced"])
      .default("basic")
      .describe("Search depth - basic is faster, advanced is more thorough"),
  }),
  execute: async ({
    query,
    max_results,
    include_domains,
    exclude_domains,
    search_depth,
  }) => {
    try {
      // Get API key from settings system
      const apiKey = "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";

      if (!apiKey) {
        return {
          success: false,
          message:
            "Error: Tavily API key not configured. Please configure the API key in settings.",
        };
      }

      // Prepare request to Tavily API
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          query,
          max_results,
          include_domains,
          exclude_domains,
          search_depth,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Tavily API error (${response.status}): ${errorText}`);
      }

      const searchResults = await response.json();

      // Format results for display
      const formattedResults = searchResults.results
        .map(
          (
            result: {
              title: string;
              url: string;
              content: string;
            },
            index: number,
          ) => {
            return `[${index + 1}] ${result.title}\nURL: ${result.url}\n${result.content}\n`;
          },
        )
        .join("\n");

      return {
        success: true,
        message: `Search results for "${query}":\n\n${formattedResults}`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Error executing web search: ${errorMessage}`,
      };
    }
  },
});
