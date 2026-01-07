import React, { forwardRef } from "react";
import ChatInput from "./chat-input";
import type { ChatInputRef } from "./chat-input";
import { AskUserInputOverlay } from "./ask-user-input-overlay";
import { useHasPendingInput } from "@/renderer/libs/stores/user-input-store";

interface ChatInputContainerProps {
  placeholder?: string;
}

/**
 * Container component that switches between ChatInput and AskUserInputOverlay.
 * Shows overlay when there's a pending user input request, otherwise shows ChatInput.
 */
const ChatInputContainer = forwardRef<ChatInputRef, ChatInputContainerProps>(
  ({ placeholder = "Message Convera..." }, ref) => {
    const hasPendingInput = useHasPendingInput();

    // Show overlay when waiting for user input, otherwise show normal chat input
    if (hasPendingInput) {
      return <AskUserInputOverlay />;
    }

    return <ChatInput ref={ref} placeholder={placeholder} />;
  },
);

ChatInputContainer.displayName = "ChatInputContainer";

export default ChatInputContainer;
export type { ChatInputRef };
