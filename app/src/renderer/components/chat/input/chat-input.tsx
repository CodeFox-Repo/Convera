import TiptapEditor, { TiptapEditorRef } from "@/renderer/components/editor";
import { usePreviousApp } from "@/renderer/libs/hooks/use-previous-app";
import { useChatContext } from "@/renderer/libs/stores/chat-store";
import { useModelStore } from "@/renderer/libs/stores/model-store";
import { File } from "lucide-react";
import React, {
  forwardRef,
  useCallback,
  useEffect,
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
  ({ hasMessages = false, placeholder = "Message FoxyChat..." }, ref) => {
    const editorRef = useRef<TiptapEditorRef>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [editorContent, setEditorContent] = useState("");
    const [isDragging, setIsDragging] = useState(false);

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
      openHistoryWindow,
      attachments,
      addAttachments,
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

    // Handle file upload via button
    const handleFileUpload = useCallback(() => {
      fileInputRef.current?.click();
    }, []);

    // Handle file selection from input
    const handleFileSelect = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
          addAttachments(Array.from(e.target.files));
        }
        // Reset the input value to allow selecting the same file again
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      },
      [addAttachments],
    );

    // Handle drag events
    const handleDragEnter = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
    }, []);

    const handleDragOver = useCallback(
      (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isDragging) setIsDragging(true);
      },
      [isDragging],
    );

    const handleDragLeave = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
    }, []);

    const handleDrop = useCallback(
      (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          addAttachments(Array.from(e.dataTransfer.files));
        }
      },
      [addAttachments],
    );

    // Handle clipboard paste for images
    useEffect(() => {
      const handlePaste = (e: ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf("image") !== -1) {
            const file = items[i].getAsFile();
            if (file) {
              addAttachments(file);
            }
          }
        }
      };

      document.addEventListener("paste", handlePaste);
      return () => {
        document.removeEventListener("paste", handlePaste);
      };
    }, [addAttachments]);

    // Handle form submission with files
    const handleSubmit = () => {
      if (!isLoading && (editorContent.trim() || attachments.length > 0)) {
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
      <div
        className="drag-region h-full flex flex-col"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="h-full w-full flex-1 flex flex-col p-1 min-h-0">
          <div
            className={`flex-1 flex h-full overflow-auto flex-col rounded-2xl border-1 transition-all duration-200 ${
              hasMessages ? "bg-background/80" : "bg-background/30"
            } ${
              isDragging
                ? "border-primary/70 border-2 shadow-lg ring-2 ring-primary/20"
                : "border-gray-500/45"
            }`}
          >
            <ContextButtons
              copiedContent={copiedContent || null}
              formatAppName={formatAppName}
              onRejectCopiedContent={rejectCopiedContent}
              onAddFile={handleFileUpload}
            />

            {isDragging && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10 pointer-events-none">
                <div className="flex flex-col items-center gap-2 animate-pulse">
                  <File size={32} className="text-primary" />
                  <p className="text-foreground/70 font-medium">
                    Drop files here
                  </p>
                </div>
              </div>
            )}

            <div className="drag-region mb-2 w-full flex-1 px-2">
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
              hasContent={!!editorContent.trim() || attachments.length > 0}
              selectedModelId={selectedModelId}
              onModelSelect={setSelectedModelId}
            />
          </div>
        </div>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden"
          multiple
        />
      </div>
    );
  },
);

ChatInput.displayName = "ChatInput";

export default ChatInput;
