import { FullEmojiPicker } from "@/renderer/components/common/emoji-picker";
import { useAgentStore } from "@/renderer/libs/stores/agent-store";
import { useChatContext } from "@/renderer/libs/stores/chat-store";
import * as Popover from "@radix-ui/react-popover";
import {
  ArrowUp,
  AtSign,
  Bot,
  CaseSensitive,
  Paperclip,
  Smile,
  Square,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import ModelSelector from "../popover/model-selector-popover";

interface ChatInputButtonsProps {
  variant?: "chat" | "channel";
  onStopGeneration?: () => void;
  onSendMessage?: () => void;
  /** Inserts "@" at the caret so the mention autocomplete opens. */
  onMention: () => void;
  /** Inserts a literal emoji at the caret. */
  onInsertText: (text: string) => void;
  isLoading: boolean;
  hasContent: boolean;
}

const iconButtonClassName =
  "no-drag-region text-muted-foreground hover:text-foreground flex size-7 items-center justify-center rounded-md transition-colors";

export function ChatInputButtons(props: ChatInputButtonsProps) {
  const { selectedAgent, triggerAgentSelect, subscribeToAgentChanges } =
    useAgentStore();
  const { addAttachments } = useChatContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToAgentChanges();
    return unsubscribe;
  }, [subscribeToAgentChanges]);

  const isNamedAgent =
    !!selectedAgent &&
    selectedAgent.id !== "DefaultAssistant" &&
    selectedAgent.name !== "Default Assistant";

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 0) addAttachments(files);
    event.target.value = "";
  };

  return (
    <div className="drag-region flex items-center justify-between gap-2 px-2 pb-1.5">
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={props.onMention}
          className={iconButtonClassName}
          title="Mention someone"
          aria-label="Mention someone"
        >
          <AtSign size={15} />
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={iconButtonClassName}
          title="Attach a file"
          aria-label="Attach a file"
        >
          <Paperclip size={15} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

        <Popover.Root open={emojiOpen} onOpenChange={setEmojiOpen}>
          <Popover.Trigger asChild>
            <button
              type="button"
              className={iconButtonClassName}
              title="Emoji"
              aria-label="Emoji"
            >
              <Smile size={15} />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="bg-popover border-border text-popover-foreground z-50 overflow-hidden rounded-xl border p-1 shadow-lg"
              side="top"
              align="start"
              sideOffset={8}
            >
              <FullEmojiPicker
                onPick={(emoji) => {
                  props.onInsertText(emoji);
                  setEmojiOpen(false);
                }}
              />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        {/* ponytail: formatting is a placeholder until the editor exposes marks */}
        <button
          type="button"
          disabled
          className={`${iconButtonClassName} disabled:opacity-60`}
          title="Formatting (coming soon)"
          aria-label="Formatting (coming soon)"
        >
          <CaseSensitive size={15} />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {/* In a channel the agents are room members who choose to reply;
            picking a single bot contradicts the room model. */}
        {props.variant !== "channel" && (
          <>
            <button
              type="button"
              className={
                isNamedAgent
                  ? "no-drag-region bg-primary/20 text-primary hover:bg-primary/30 flex items-center rounded-xs px-2 py-0.5 text-xs font-medium"
                  : `${iconButtonClassName} size-7`
              }
              onClick={(e) => triggerAgentSelect(e, selectedAgent)}
              title="Select agent"
            >
              <Bot
                size={isNamedAgent ? 12 : 15}
                className={isNamedAgent ? "mr-1" : ""}
              />
              {isNamedAgent && selectedAgent.name}
            </button>
            <ModelSelector />
          </>
        )}

        {props.isLoading && props.onStopGeneration ? (
          <button
            type="button"
            onClick={props.onStopGeneration}
            className="no-drag-region bg-foreground/10 hover:bg-foreground/20 active:bg-foreground/30 flex size-7 items-center justify-center circle transition-colors"
            aria-label="Stop generation"
          >
            <Square
              size={12}
              strokeWidth={2.5}
              fill="none"
              className="text-foreground"
            />
          </button>
        ) : (
          <button
            type="button"
            onClick={props.onSendMessage}
            disabled={props.isLoading || !props.hasContent}
            className="no-drag-region bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground flex size-7 items-center justify-center circle transition-colors disabled:cursor-not-allowed"
            aria-label="Send message"
          >
            <ArrowUp size={16} strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  );
}
