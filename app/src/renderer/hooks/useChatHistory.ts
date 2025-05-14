import { ChatData } from "@/server/service/chat";
import { useEffect } from "react";

/**
 * Hook to handle chat history functionality
 */
export function useChatHistory(onLoadChatHistory?: (chat: ChatData) => void) {
  /**
   * Function to open chat history window
   */
  const openChatHistoryWindow = async () => {
    try {
      if (window.electronAPI) {
        await window.electronAPI
          .toggleHistoryWindow()
          .then(() => {
            console.log("Chat history window toggled successfully");
          })
          .catch((error: Error) => {
            console.error("Error toggling chat history window:", error);
          });
      } else {
        console.error("electronAPI is not available");
      }
    } catch (error: unknown) {
      console.error("Error toggling chat history window:", error);
    }
  };

  // Listen for chat history selection from the history window
  useEffect(() => {
    // Create a handler for history selection events
    const handleChatHistorySelected = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail && customEvent.detail.chat && onLoadChatHistory) {
        console.log("Chat history selected:", customEvent.detail.chat);
        onLoadChatHistory(customEvent.detail.chat);
      }
    };

    // Add event listener
    window.addEventListener("chat-history-selected", handleChatHistorySelected);

    // Clean up on unmount
    return () => {
      window.removeEventListener(
        "chat-history-selected",
        handleChatHistorySelected,
      );
    };
  }, [onLoadChatHistory]);

  return {
    openChatHistoryWindow,
  };
}
