import dotenv from "dotenv";
import express, { Request, Response } from 'express';
import mcpRoutes from "./mcp/mcpRoutes"; // Corrected import path

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3003;

// Enable JSON parsing middleware
app.use(express.json());

app.get('/', (req: Request, res: Response) => {
  res.send('Hello, TypeScript Express Server!');
});

// MCP marketplace endpoint
app.use("/api/mcp", mcpRoutes); // Use MCP routes

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
