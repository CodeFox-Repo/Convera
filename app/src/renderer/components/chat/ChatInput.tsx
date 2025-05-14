import TiptapEditor, { TiptapEditorRef } from "@/renderer/components/editor";
import { Agent, useAgentSelection } from "@/renderer/hooks/useAgentSelection";
import { useChatHistory } from "@/renderer/hooks/useChatHistory";
import { usePreviousApp } from "@/renderer/hooks/usePreviousApp";
import { ChatData } from "@/server/service/chat";
import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { ChatInputButtons } from "./ChatInputButtons";
import { ContextButtons } from "./ContextButtons";

interface ChatInputProps {
  isLoading: boolean;
  input: string;
  setInput: (value: string) => void;
  hasMessages?: boolean;
  onAddAttachment?: () => void;
  onToggleTranslation?: () => void;
  onReset?: () => void;
  onVoiceInput?: () => void;
  onSendMessage?: () => void;
  onStopGeneration?: () => void;
  onOpenSettings?: () => void;
  selectedAgent?: Agent | null;
  onAgentSelect?: (agent: Agent | null) => void;
  placeholder?: string;
  selectedModelId?: string;
  onModelSelect?: (modelId: string) => void;
  onLoadChatHistory?: (chat: ChatData) => void;
  copiedContent?: string | null;
  onRejectCopiedContent?: () => void;
}

export interface ChatInputRef {
  focus: () => void;
  getInput: () => string;
  setInput: (content: string) => void;
  editor: TiptapEditorRef | null;
}

const ChatInput = forwardRef<ChatInputRef, ChatInputProps>(
  (
    {
      isLoading,
      input,
      setInput,
      hasMessages = false,
      onReset,
      onVoiceInput,
      onSendMessage,
      onStopGeneration,
      onOpenSettings,
      selectedAgent,
      onAgentSelect,
      placeholder = "Message FoxyChat...",
      selectedModelId,
      onModelSelect,
      onLoadChatHistory,
      copiedContent,
    },
    ref,
  ) => {
    const editorRef = useRef<TiptapEditorRef>(null);
    const [editorContent, setEditorContent] = useState("");

    const { formatAppName } = usePreviousApp();
    const { handleAgentButtonClick } = useAgentSelection(onAgentSelect);
    const { openChatHistoryWindow } = useChatHistory(onLoadChatHistory);

    // Expose methods to parent components
    useImperativeHandle(ref, () => ({
      focus: () => {
        editorRef.current?.focus();
      },
      getInput: () => {
        return editorRef.current?.getText() || "";
      },
      setInput: (content: string) => {
        if (editorRef.current) {
          // Clear content first
          editorRef.current.clearContent();

          // Set new content with a small delay to ensure clearContent completes
          setTimeout(() => {
            // Update parent's input state
            setInput(content);

            // Update local state
            if (editorRef.current) {
              setEditorContent(editorRef.current.getText());
            }
          }, 0);
        }
      },
      editor: editorRef.current,
    }));

    // Handle editor content change
    const handleEditorChange = (content: string) => {
      setInput(content);
      if (editorRef.current) {
        setEditorContent(editorRef.current.getText());
      }
    };

    // Handle form submission
    const handleSubmit = () => {
      if (onSendMessage && !isLoading && editorContent.trim()) {
        onSendMessage();
      }
    };

    return (
      <div className="drag-region h-full flex flex-col">
        <div className="h-full w-full flex-1 flex flex-col p-1 min-h-0">
          <div
            className={`flex-1 flex h-full overflow-auto flex-col rounded-[var(--app-border-radius)] border-1 border-gray-500/45 p-2 ${
              hasMessages ? "bg-background/80" : "bg-background/30"
            }`}
          >
            <ContextButtons
              copiedContent={copiedContent || null}
              formatAppName={formatAppName}
            />

            <div className="drag-region mb-2 w-full flex-1">
              <TiptapEditor
                ref={editorRef}
                content={input}
                onChange={handleEditorChange}
                placeholder={placeholder}
                disabled={isLoading}
                onSubmit={handleSubmit}
                autoFocus={true}
              />
            </div>

            <ChatInputButtons
              onReset={onReset}
              onOpenSettings={onOpenSettings}
              onVoiceInput={onVoiceInput}
              onStopGeneration={onStopGeneration}
              onSendMessage={handleSubmit}
              onOpenChatHistory={openChatHistoryWindow}
              isLoading={isLoading}
              hasContent={!!editorContent.trim()}
              selectedAgent={selectedAgent}
              onAgentButtonClick={(e) =>
                handleAgentButtonClick(e, selectedAgent)
              }
              selectedModelId={selectedModelId}
              onModelSelect={onModelSelect}
            />
          </div>
        </div>
      </div>
    );
  },
);

ChatInput.displayName = "ChatInput";

export default ChatInput;
