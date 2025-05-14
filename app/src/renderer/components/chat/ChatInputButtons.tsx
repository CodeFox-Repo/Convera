import { Agent } from "@/renderer/hooks/useAgentSelection";
import { usePreviousApp } from "@/renderer/hooks/usePreviousApp";
import {
  Bot,
  History,
  Mic,
  Monitor,
  RotateCcw,
  Send,
  Settings,
  Square,
} from "lucide-react";
import React from "react";
import ModelSelector from "./ModelSelector";

interface ChatInputButtonsProps {
  onReset?: () => void;
  onOpenSettings?: () => void;
  onVoiceInput?: () => void;
  onStopGeneration?: () => void;
  onSendMessage?: () => void;
  onOpenChatHistory: () => void;
  isLoading: boolean;
  hasContent: boolean;
  selectedAgent?: Agent | null;
  onAgentButtonClick: (
    e: React.MouseEvent<HTMLButtonElement>,
    agent: Agent | null | undefined,
  ) => void;
  selectedModelId?: string;
  onModelSelect?: (modelId: string) => void;
}

export function ChatInputButtons({
  onReset,
  onOpenSettings,
  onVoiceInput,
  onStopGeneration,
  onSendMessage,
  onOpenChatHistory,
  isLoading,
  hasContent,
  selectedAgent,
  onAgentButtonClick,
  selectedModelId,
  onModelSelect,
}: ChatInputButtonsProps) {
  const { previousApp, formatAppName } = usePreviousApp();

  return (
    <div className="ml-2 drag-region flex min-h-[30px] items-center justify-between">
      {/* Left icons */}
      <div className="flex flex-1 items-center space-x-4">
        <button
          onClick={onReset}
          className="no-drag-region text-foreground/70 hover:text-foreground"
        >
          <RotateCcw size={16} />
        </button>

        <button
          onClick={onOpenChatHistory}
          className="no-drag-region text-foreground/70 hover:text-foreground"
          title="View chat history"
        >
          <History size={16} />
        </button>

        <button
          onClick={onOpenSettings}
          className="no-drag-region text-foreground/70 hover:text-foreground"
        >
          <Settings size={16} />
        </button>

        {/* Agent selector button */}
        <button
          className={`no-drag-region flex items-center ${
            selectedAgent
              ? "bg-primary/20 text-primary hover:bg-primary/30 rounded px-2 py-0.5 text-xs font-medium"
              : "text-foreground/70 hover:text-foreground"
          }`}
          onClick={(e) => onAgentButtonClick(e, selectedAgent)}
        >
          <Bot
            size={selectedAgent ? 12 : 16}
            className={selectedAgent ? "mr-1" : ""}
          />
          {selectedAgent && selectedAgent.name}
        </button>

        {/* Model selector */}
        {selectedModelId && onModelSelect && (
          <div className="no-drag-region inline-flex items-center">
            <ModelSelector
              selectedModel={selectedModelId}
              onSelectModel={onModelSelect}
            />
          </div>
        )}

        {/* Previous app badge */}
        {previousApp && (
          <div className="no-drag-region bg-primary/20 text-black/40 dark:text-white flex items-center rounded px-2 py-0.5 text-xs font-medium">
            <Monitor size={12} className="mr-1" />
            {formatAppName(previousApp)}
          </div>
        )}
      </div>

      {/* Right side - Mic and Send buttons */}
      <div className="flex shrink-0 items-center">
        <button
          onClick={onVoiceInput}
          className="no-drag-region text-foreground/70 hover:bg-foreground/10 hover:text-foreground active:bg-foreground/20 mr-3 rounded-full p-1.5"
        >
          <Mic size={16} />
        </button>

        {isLoading && onStopGeneration ? (
          <button
            onClick={onStopGeneration}
            className="no-drag-region bg-foreground/10 hover:bg-foreground/20 active:bg-foreground/30 flex size-8 items-center justify-center rounded-md transition-colors dark:bg-[#353541] dark:hover:bg-[#40404B] dark:active:bg-[#494952]"
            aria-label="Stop generation"
          >
            <Square
              size={14}
              strokeWidth={2.5}
              fill="none"
              className="text-foreground dark:text-white"
            />
          </button>
        ) : (
          <button
            onClick={onSendMessage}
            disabled={isLoading || !hasContent}
            className={`no-drag-region ${
              !hasContent || isLoading
                ? "text-foreground/30 cursor-not-allowed"
                : "text-foreground hover:text-primary"
            }`}
            aria-label="Send message"
          >
            <Send size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
