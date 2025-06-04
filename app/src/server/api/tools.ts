import { Hono } from "hono";
import { serverTools } from "../mcp/dev-mcp/tools";

const router = new Hono();

router.get("/api/tools", (c) => {
  const tools = Object.keys(serverTools);
  return c.json({ tools });
});

export default router;
