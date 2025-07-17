// app/src/renderer/components/chat/expanded-chat-view.tsx
import { useAgentStore } from "@/renderer/libs/stores/agent-store";
import { useChatContext } from "@/renderer/libs/stores/chat-store";
import { useChatUIStore } from "@/renderer/libs/stores/chat-ui-store";
import { useSettingsStore } from "@/renderer/libs/stores/settings-store";
import {
  ErrorCode,
  parseApiError,
  type GenericError,
} from "@/renderer/libs/utils/error-handler";
import { AnimatePresence, motion } from "framer-motion";
import { LayoutDashboard, Plus, Sparkles, X } from "lucide-react";
import React, { useEffect, useRef } from "react";
import RateLimitError from "../error/rate-limit-error";
import ChatInput, { ChatInputRef } from "../input/chat-input";
import ChatContent from "../message/chat-content";

interface ExpandedChatViewProps {
  chatInputRef: React.RefObject<ChatInputRef | null>;
}

const ExpandedChatView: React.FC<ExpandedChatViewProps> = ({
  chatInputRef,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, isLoading, editMessage, regenerateMessage, error } =
    useChatContext();

  const { showControls, setShowControls } = useChatUIStore();
  const { agentChanged, handleAgentChange } = useAgentStore();

  const enableMainWindow = useSettingsStore(
    (state) => state.experimentalFeatures.enableMainWindow,
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const controlsTimerRef = useRef<number | null>(null);

  const handleMouseEnter = () => {
    if (controlsTimerRef.current) {
      window.clearTimeout(controlsTimerRef.current);
    }
    setShowControls(true);
  };

  const handleMouseLeave = () => {
    if (controlsTimerRef.current) {
      window.clearTimeout(controlsTimerRef.current);
    }

    controlsTimerRef.current = window.setTimeout(() => {
      setShowControls(false);
    }, 500);
  };

  useEffect(() => {
    return () => {
      if (controlsTimerRef.current) {
        window.clearTimeout(controlsTimerRef.current);
      }
    };
  }, []);

  const handleExit = () => {
    if (window.electronAPI) {
      window.electronAPI.closeWindow();
    }
  };

  const handleNewHistory = () => {
    window.location.reload();
  };

  const handleOpenMainWindow = () => {
    window.electronAPI.toggleWindow("main");
  };

  return (
    <div className="h-full w-full flex items-center justify-center">
      <div
        className="bg-background border-border rounded-xl border shadow-lg transition-all duration-300 ease-in-out h-full w-full"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="no-drag-region bg-transparent flex h-full w-full flex-col relative">
          <div className="drag-region pointer-events-auto relative z-[100] h-12 w-full">
            <AnimatePresence>
              {showControls && (
                <motion.div
                  className="no-drag-region absolute inset-x-0 top-4 flex justify-between items-center px-6"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Left side - branding */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/20 dark:bg-black/20 border border-white/20 dark:border-white/10">
                      <Sparkles size={16} className="text-orange-500" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                        FoxyChat
                      </span>
                    </div>
                  </div>

                  {/* Right side controls */}
                  <div className="flex items-center gap-3">
                    {/* Main Window Button - Only show if experimental feature is enabled */}
                    {enableMainWindow && (
                      <button
                        onClick={handleOpenMainWindow}
                        className="p-2.5 rounded-full bg-white/20 dark:bg-black/20 border border-white/20 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-white/30 dark:hover:bg-black/30 transition-all duration-200"
                        aria-label="Open main window"
                        title="Open Main Window"
                      >
                        <LayoutDashboard size={18} />
                      </button>
                    )}
                    <button
                      onClick={handleNewHistory}
                      className="p-2.5 rounded-full bg-white/20 dark:bg-black/20 border border-white/20 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white hover:bg-white/30 dark:hover:bg-black/30 transition-all duration-200"
                      aria-label="New chat"
                    >
                      <Plus size={18} />
                    </button>
                    <button
                      onClick={handleExit}
                      className="p-2.5 rounded-full bg-white/20 dark:bg-black/20 border border-white/20 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:text-red-500 dark:hover:text-red-400 hover:bg-white/30 dark:hover:bg-black/30 transition-all duration-200"
                      aria-label="Exit"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="drag-region flex flex-1 flex-col overflow-hidden">
            <div className="drag-region min-h-0 flex-1 overflow-y-auto p-4">
              <ChatContent
                messages={messages}
                messagesEndRef={messagesEndRef}
                isLoading={isLoading}
                onEditMessage={editMessage}
                onRegenerateMessage={regenerateMessage}
                agentChanged={agentChanged}
                onRegenerateWithNewAgent={() => handleAgentChange(true)}
                onIgnoreAgentChange={() => handleAgentChange(false)}
              />
            </div>

            {error &&
              (() => {
                const parsedError = parseApiError(
                  error as unknown as GenericError,
                );

                // Handle rate limit error specifically
                if (parsedError.code === ErrorCode.RATE_LIMIT) {
                  return (
                    <RateLimitError blockedUntil={parsedError.blockedUntil} />
                  );
                }

                // Default error display
                return (
                  <div className="mx-auto w-[90%] border-red-500 rounded-md p-4 text-center">
                    <p className="text-red-500 font-medium">
                      {parsedError.message}
                    </p>
                  </div>
                );
              })()}

            <div className="drag-region flex flex-col p-2">
              <div className="flex-1">
                <ChatInput
                  ref={chatInputRef}
                  hasMessages={true}
                  placeholder="Message to FoxyChat..."
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExpandedChatView;
