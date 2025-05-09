/**
 * Server startup script
 */
import { startChatServer } from "./chatServer";

// Start the server when this file is executed directly
if (require.main === module) {
  startChatServer();
}
