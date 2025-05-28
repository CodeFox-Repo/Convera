import express from "express";
import agentRoutes from "./agent";
import chatRoutes from "./chat";
import mcpRoutes from "./mcp";
import toolsRoutes from "./tools";

const router = express.Router();

router.get("/health", (req, res) => {
  res.json({ status: "ok", message: "FoxyChat API server is running" });
});

router.use("/chat", chatRoutes);
router.use("/chats", chatRoutes);
router.use("/agents", agentRoutes);
router.use("/mcp", mcpRoutes);
router.use("/tools", toolsRoutes);

export default router;
