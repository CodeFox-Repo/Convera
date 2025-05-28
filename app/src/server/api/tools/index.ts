import express, { Request, Response } from "express";
import { serverTools } from "../../mcp/dev-mcp/tools";

const router = express.Router();

router.get("/", (req: Request, res: Response) => {
  res.json({ status: "success", tools: serverTools });
});

export default router;
