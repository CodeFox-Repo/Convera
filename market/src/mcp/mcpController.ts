// src/mcp/mcpController.ts
import { Request, Response } from "express";

export const getMarketplaceData = async (req: Request, res: Response) => {
  try {
    const response = await fetch("https://api.cline.bot/v1/mcp/marketplace", {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch marketplace data: ${response.status} ${response.statusText}`,
      );
    }

    const externalData = await response.json();

    if (Array.isArray(externalData)) {
      const catalog = {
        items: externalData,
      };
      res.json({ status: "success", catalog });
    } else {
      res.json({ status: "success", catalog: externalData });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error fetching MCP marketplace:", errorMessage);
    res.status(500).json({ status: "error", message: errorMessage });
  }
};
