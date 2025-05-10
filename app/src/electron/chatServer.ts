/**
 * Helper to integrate chat server with Electron
 */
import { startChatServer } from "@/server/chatServer";

export async function initializeChatServer() {
  // Start chat server directly, as we're already in app.whenReady() in main.ts
  startChatServer();
  console.log("Chat server initialized");
  return Promise.resolve(); // Return a resolved promise to maintain async behavior
}
