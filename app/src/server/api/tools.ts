import express from "express";
import { serverTools } from "../mcp/dev-mcp/tools";

const router = express.Router();

router.get("/api/tools", (req, res) => {
  const tools = Object.keys(serverTools);
  res.json({ tools });
});

export default router;
