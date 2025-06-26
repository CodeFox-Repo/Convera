// app/src/renderer/components/chat/expanded-chat-view.tsx
import { useChatContext } from "@/renderer/libs/stores/chat-store";
import { motion } from "framer-motion";
import {
  Loader2,
  Settings as SettingsIcon,
  StopCircle,
  X as XIcon,
} from "lucide-react";
import React, { useMemo } from "react";

const VisionChatView: React.FC = () => {
  const { stopGeneration, messages, isLoading } = useChatContext();

  const handleExit = () => {
    window.electronAPI?.toggleWindow("vision");
  };

  const handleSettings = () => {
    window.electronAPI?.toggleWindow("settings");
  };
  const lastAssistantMessage = useMemo(() => {
    return messages.filter((message) => message.role === "assistant").pop();
  }, [messages]);

  const actionText = React.useMemo(() => {
    if (lastAssistantMessage?.content) {
      const match = lastAssistantMessage.content.match(
        /<action>(.*?)<\/action>/s,
      );
      if (match?.[1]) {
        return match[1].trim();
      }
    }
    if (isLoading) {
      return "Thinking...";
    }
    return "Waiting for command...";
  }, [lastAssistantMessage, isLoading]);
  // --- Styles from reference ---
  const iconBare =
    "flex items-center justify-center p-1 text-orange-400 hover:text-orange-300 transition focus:outline-none";
  const iconRound =
    "relative flex h-8 w-8 items-center justify-center rounded-full text-orange-400 hover:bg-white/5 transition focus:outline-none";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="bg-neutral-950/90 w-full h-full rounded-xl p-2 flex flex-col justify-center space-y-1 backdrop-blur-sm"
    >
      {/* Top Input-like bar */}
      <div className="rounded-lg border border-neutral-700 px-2 py-2 shadow-inner-white-sm">
        <div className="flex items-center justify-between gap-2">
          {/* Always-loading spinner */}
          <div className={iconBare} aria-label="Loading">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>

          {/* Placeholder text */}
          <span className="flex-1 truncate text-center text-sm text-neutral-400">
            {actionText}
          </span>

          {/* Stop button */}
          <button
            aria-label="Stop"
            onClick={stopGeneration}
            className={iconBare}
          >
            <StopCircle className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="flex items-center justify-center gap-6 pt-1">
        <button aria-label="Exit" onClick={handleExit} className={iconRound}>
          <XIcon className="h-5 w-5" />
        </button>

        <button
          aria-label="Settings"
          onClick={handleSettings}
          className={iconRound}
        >
          <SettingsIcon className="h-5 w-5" />
        </button>
      </div>
    </motion.div>
  );
};

export default VisionChatView;
