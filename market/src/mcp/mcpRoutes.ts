// src/mcp/mcpRoutes.ts
import express from "express";
import { getMarketplaceData } from "./mcpController";

const router = express.Router();

router.get("/marketplace", getMarketplaceData);

export default router;