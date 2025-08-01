/**
 * FoxyChat Agent Tools - Web Fetch
 *
 * Simple web fetching tool for AI agents.
 */

import { tool } from "ai";
import { z } from "zod";

/**
 * Fetch content from a URL
 */
async function fetchUrl(
  url: string,
  options: { timeout?: number } = {},
): Promise<{
  success: boolean;
  url: string;
  status?: number;
  statusText?: string;
  content?: string;
  contentType?: string;
  error?: string;
}> {
  try {
    const { timeout = 10000 } = options;

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "FoxyChat/1.0 (Web Fetch Tool)",
      },
    });

    clearTimeout(timeoutId);

    const contentType = response.headers.get("content-type") || "";
    let content = "";

    // Only try to read text content for reasonable content types
    if (
      contentType.includes("text/") ||
      contentType.includes("application/json") ||
      contentType.includes("application/xml") ||
      contentType.includes("application/javascript")
    ) {
      // Limit content size to prevent memory issues
      const text = await response.text();
      content =
        text.length > 50000
          ? text.substring(0, 50000) +
            "\n\n[Content truncated due to size limit]"
          : text;
    } else {
      content = `[Binary content - ${contentType}]`;
    }

    return {
      success: response.ok,
      url,
      status: response.status,
      statusText: response.statusText,
      content,
      contentType,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    if (error.name === "AbortError") {
      return {
        success: false,
        url,
        error: "Request timeout",
      };
    }

    return {
      success: false,
      url,
      error: error.message || String(error),
    };
  }
}

// Define web fetch tool
export const webFetch = tool({
  description: "Fetch content from a web URL and return the response",
  parameters: z.object({
    url: z.string().url().describe("The URL to fetch"),
    timeout: z
      .number()
      .min(1000)
      .max(30000)
      .default(10000)
      .describe("Timeout in milliseconds (default: 10000, max: 30000)"),
  }),
  execute: async ({ url, timeout }) => {
    const result = await fetchUrl(url, { timeout });

    if (result.success) {
      return {
        success: true,
        url: result.url,
        status: result.status,
        statusText: result.statusText,
        contentType: result.contentType,
        content: result.content,
        message: `Successfully fetched ${url}\nStatus: ${result.status} ${result.statusText}\nContent-Type: ${result.contentType}\n\nContent:\n${result.content}`,
      };
    } else {
      return {
        success: false,
        url: result.url,
        error: result.error,
        message: `Failed to fetch ${url}: ${result.error}`,
      };
    }
  },
});
