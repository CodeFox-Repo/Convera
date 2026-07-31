import React, { forwardRef } from "react";
import ChatInput from "./chat-input";
import type { ChatInputRef } from "./chat-input";
import { AskUserInputOverlay } from "./ask-user-input-overlay";
import { useHasPendingInput } from "@/renderer/libs/stores/user-input-store";

interface ChatInputContainerProps {
  placeholder?: string;
  /**
   * "chat": 1:1 with a picked bot — the toolbar shows who you're talking to.
   * "channel": a room — agents are members who decide themselves whether to
   * reply, so the input is just a message box. Mention with @ to address one.
   */
  variant?: "chat" | "channel";
}

/**
 * Container component that switches between ChatInput and AskUserInputOverlay.
 * Shows overlay when there's a pending user input request, otherwise shows ChatInput.
 */
const ChatInputContainer = forwardRef<ChatInputRef, ChatInputContainerProps>(
  ({ placeholder = "Message...", variant = "chat" }, ref) => {
    const hasPendingInput = useHasPendingInput();

    // Show overlay when waiting for user input, otherwise show normal chat input
    if (hasPendingInput) {
      return <AskUserInputOverlay />;
    }

    return <ChatInput ref={ref} placeholder={placeholder} variant={variant} />;
  },
);

ChatInputContainer.displayName = "ChatInputContainer";

export default ChatInputContainer;
export type { ChatInputRef };
