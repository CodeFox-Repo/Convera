import { ChatData } from "@/server/service/chat";
import { Message } from "ai";
import { useEffect } from "react";

/**
 * Hook to handle chat history functionality
 */
export function useChatHistory(setMessages: (messages: Message[]) => void) {
  /**
   * Function to open chat history window
   */
  const triggerHistoryWindow = async () => {
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
      if (customEvent.detail && customEvent.detail.chat) {
        const chatHistory = customEvent.detail.chat as ChatData;
        console.log("Chat history selected in hook:", chatHistory);

        if (
          chatHistory &&
          chatHistory.messages &&
          chatHistory.messages.length > 0
        ) {
          // Reset state first to ensure clean loading
          setMessages([]);

          // Add a small delay before setting new messages
          setTimeout(() => {
            // Simple direct update approach with fallback IDs
            const formattedMessages = chatHistory.messages.map((msg) => ({
              id:
                msg.id ||
                `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              content: msg.content,
              role: msg.role,
            })) as Message[];

            console.log("Setting messages from hook:", formattedMessages);
            setMessages(formattedMessages);

            // TODO: Consider if window resizing logic is still needed here or should be handled elsewhere
            // Forcing a resize after a short delay
            // setTimeout(() => {
            //   if (window.electronAPI) {
            //     console.log("Forcing window resize for chat history from hook");
            //     window.electronAPI
            //       .getCurrentWindowSize(WINDOW_SIZE_PRESETS.EXPANDED_CHAT) // Ensure WINDOW_SIZE_PRESETS is available or remove
            //       .then((res) => {
            //         window.electronAPI.resizeMessageContent(
            //           res.width,
            //           res.height,
            //           true,
            //         );
            //       })
            //       .catch((error) => {
            //         console.error("Error resizing window from hook:", error);
            //       });
            //   }
            // }, 500);
          }, 50);
        }
      }
    };

    // Add event listener
    window.addEventListener("chat-history-selected", handleChatHistorySelected);

    // Listen for storage events to catch changes from other windows
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === "selectedChatHistory" && event.newValue) {
        console.log("Detected chat history change in localStorage (hook)");
        try {
          const chatData = JSON.parse(event.newValue);
          if (chatData && chatData.chat) {
            const chatHistory = chatData.chat as ChatData;
            console.log(
              "Loading new chat history from storage event (hook):",
              chatHistory.id,
            );
            // Reset state first
            setMessages([]);
            // Add a small delay before setting new messages
            setTimeout(() => {
              const formattedMessages = chatHistory.messages.map((msg) => ({
                id:
                  msg.id ||
                  `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                content: msg.content,
                role: msg.role,
              })) as Message[];
              setMessages(formattedMessages);
            }, 50);
          }
        } catch (error) {
          console.error(
            "Error parsing chat history from storage event (hook):",
            error,
          );
        }
      }
    };
    window.addEventListener("storage", handleStorageChange);

    // Clean up on unmount
    return () => {
      window.removeEventListener(
        "chat-history-selected",
        handleChatHistorySelected,
      );
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [setMessages]);

  return {
    triggerHistoryWindow,
  };
}
