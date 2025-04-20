/**
 * Helper to integrate chat server with Electron
 */
import { app } from "electron";
import { startChatServer } from "../server/chatServer";

export function initializeChatServer() {
  app.whenReady().then(() => {
    // Start the chat server
    startChatServer();
    console.log("Chat server initialized");
  });
}
