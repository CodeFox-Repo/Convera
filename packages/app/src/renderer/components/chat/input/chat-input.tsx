import TiptapEditor, { TiptapEditorRef } from "@/renderer/components/editor";
import { useChatContext } from "@/renderer/libs/stores/chat-store";
import { useModelStore } from "@/renderer/libs/stores/model-store";
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { ChatInputButtons } from "./chat-input-button";
import { ContextButtons } from "./context-button";

interface ChatInputProps {
  placeholder?: string;
}

export interface ChatInputRef {
  focus: () => void;
  getInput: () => string;
  setInput: (content: string) => void;
  editor: TiptapEditorRef | null;
}

const ChatInput = forwardRef<ChatInputRef, ChatInputProps>(
  ({ placeholder = "Message Convera..." }, ref) => {
    const editorRef = useRef<TiptapEditorRef>(null);
    const [editorContent, setEditorContent] = useState("");
    const previousInputRef = useRef<string>("");

    // Get state and methods from context and stores
    const {
      input,
      setInput,
      isLoading,
      sendMessage,
      stopGeneration,
      selectedContent,
      rejectSelectedContent,
      resetChatWindow,
    } = useChatContext();

    // Window controls - dispatch events for the main process to handle
    const openSettings = () => {
      window.dispatchEvent(new CustomEvent("open-settings-window"));
    };
    const openHistoryWindow = () => {
      window.dispatchEvent(new CustomEvent("open-history-window"));
    };

    const { selectedModelId, setSelectedModelId } = useModelStore();

    // Watch for speech input changes and update editor directly
    useEffect(() => {
      // Check if input has changed
      if (input !== previousInputRef.current) {
        const editorCurrentText = editorRef.current?.getText() || "";

        // If the input is different from what's currently in the editor
        if (input.trim() !== editorCurrentText.trim()) {
          // Update editor content to match the input state
          if (editorRef.current) {
            // Set the editor content to match the input (which now contains the combined text)
            editorRef.current.clearContent();

            // If there's content to set, set it
            if (input.trim()) {
              editorRef.current.insertContent(input.trim());
            }
          }
        }
      }
      previousInputRef.current = input;
    }, [input, ref]);

    // Expose methods to parent components
    useImperativeHandle(ref, () => ({
      focus: () => {
        editorRef.current?.focus();
      },
      getInput: () => {
        return editorRef.current?.getText() || "";
      },
      setInput: (content: string) => {
        console.log("🎯 setInput called with:", content);
        if (editorRef.current) {
          editorRef.current.clearContent();

          setTimeout(() => {
            setInput(content);
            if (editorRef.current) {
              setEditorContent(editorRef.current.getText());
            }
          }, 0);
        }
      },
      editor: editorRef.current,
    }));

    const handleEditorChange = (content: string) => {
      setInput(content);
      setEditorContent(content);
    };

    const handleSubmit = () => {
      if (!isLoading && editorContent.trim()) {
        sendMessage();

        // Clear the input after sending
        if (editorRef.current) {
          editorRef.current.clearContent();
        }
        setInput("");
        setEditorContent("");
      }
    };

    return (
      <div className="drag-region h-full flex flex-col">
        <div className="h-full w-full flex-1 flex flex-col min-h-0">
          <div className="flex-1 flex h-full overflow-auto flex-col rounded-2xl border border-border transition-all duration-200 bg-background">
            <ContextButtons
              selectedContent={selectedContent || null}
              onRejectSelectedContent={rejectSelectedContent}
            />

            <div className="drag-region mb-2 w-full flex-1 px-2">
              <TiptapEditor
                ref={editorRef}
                content={editorContent || input}
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
