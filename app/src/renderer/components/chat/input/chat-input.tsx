import TiptapEditor, { TiptapEditorRef } from "@/renderer/components/editor";
import { usePreviousApp } from "@/renderer/libs/hooks/use-previous-app";
import { useChatContext } from "@/renderer/libs/stores/chat-store";
import { useModelStore } from "@/renderer/libs/stores/model-store";
import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { ChatInputButtons } from "./chat-input-button";
import { ContextButtons } from "./context-button";

interface ChatInputProps {
  hasMessages?: boolean;
  placeholder?: string;
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
      hasMessages = false,
      placeholder = "Message FoxyChat...",
    },
    ref,
  ) => {
    const editorRef = useRef<TiptapEditorRef>(null);
    const [editorContent, setEditorContent] = useState("");

    // Get state and methods from context and stores
    const { 
      input, 
      setInput, 
      isLoading, 
      sendMessage, 
      stopGeneration,
      copiedContent,
      rejectCopiedContent,
      resetChatWindow,
      handleVoiceInput,
      openSettings,
      openHistoryWindow
    } = useChatContext();
    
    const { selectedModelId, setSelectedModelId } = useModelStore();
    const { formatAppName } = usePreviousApp();

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
      if (!isLoading && editorContent.trim()) {
        sendMessage();
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
              onRejectCopiedContent={rejectCopiedContent}
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
              onReset={resetChatWindow}
              onOpenSettings={openSettings}
              onVoiceInput={handleVoiceInput}
              onStopGeneration={stopGeneration}
              onSendMessage={handleSubmit}
              triggerHistoryWindow={openHistoryWindow}
              isLoading={isLoading}
              hasContent={!!editorContent.trim()}
              selectedModelId={selectedModelId}
              onModelSelect={setSelectedModelId}
            />
          </div>
        </div>
      </div>
    );
  },
);

ChatInput.displayName = "ChatInput";

export default ChatInput;
