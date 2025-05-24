import React from "react";
import Chat from "../components/chat";
import { ChatProvider } from "../libs/stores/chat-store";

export default function HomePage() {
  return (
    <ChatProvider>
      <Chat />
    </ChatProvider>
  );
}
