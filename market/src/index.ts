import express from 'express';
import mcpRoutes from "./mcp/mcpRoutes"; // Corrected import path

const app = express();
const PORT = 3003;

// MCP marketplace endpoint
app.use("/api/mcp", mcpRoutes); // Use MCP routes

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
