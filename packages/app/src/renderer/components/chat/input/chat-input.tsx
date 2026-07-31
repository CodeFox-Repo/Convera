import TiptapEditor, { TiptapEditorRef } from "@/renderer/components/editor";
import { activeMentionQuery } from "@/renderer/libs/mention-parser";
import { useChatContext } from "@/renderer/libs/stores/chat-store";
import { useMembers } from "@/renderer/libs/stores/member-store";
import type { Member } from "@/shared/types/workspace";
import { resolveSenderName } from "@/renderer/libs/chat-labels";
import { X } from "lucide-react";
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
import MentionAutocomplete, {
  MentionAutocompleteRef,
} from "./mention-autocomplete";

interface ChatInputProps {
  placeholder?: string;
  /** "channel" hides the bot picker — members reply on their own judgment. */
  variant?: "chat" | "channel";
}

export interface ChatInputRef {
  focus: () => void;
  getInput: () => string;
  setInput: (content: string) => void;
  editor: TiptapEditorRef | null;
}

const ChatInput = forwardRef<ChatInputRef, ChatInputProps>(
  ({ placeholder = "Message...", variant = "chat" }, ref) => {
    const editorRef = useRef<TiptapEditorRef>(null);
    const [editorContent, setEditorContent] = useState("");
    const previousInputRef = useRef<string>("");

    const members = useMembers() ?? [];
    const membersRef = useRef(members);
    membersRef.current = members;
    const autocompleteRef = useRef<MentionAutocompleteRef>(null);
    const [mention, setMention] = useState<{
      start: number;
      query: string;
    } | null>(null);

    // Get state and methods from context and stores
    const {
      input,
      setInput,
      isLoading,
      sendMessage,
      stopGeneration,
      selectedContent,
      rejectSelectedContent,
      messages,
      replyTargetId,
      setReplyTarget,
    } = useChatContext();
    const replyTarget = replyTargetId
      ? messages.find((message) => message.id === replyTargetId)
      : undefined;
    const replySender = replyTarget?.senderId
      ? members.find((member) => member.id === replyTarget.senderId)
      : undefined;
    const replySenderName = replyTarget
      ? resolveSenderName({
          senderName: replySender?.name,
          isUser: replyTarget.role === "user",
        })
      : null;

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

    const handleCaretChange = useCallback((caret: number, text: string) => {
      setMention(activeMentionQuery(text, caret, membersRef.current));
    }, []);

    const handleMentionSelect = useCallback(
      (member: Member) => {
        if (!mention || !editorRef.current) return;
        const text = editorRef.current.getText();
        // Replace from the `@` through the caret query with the full name.
        const next =
          text.slice(0, mention.start) +
          `@${member.name} ` +
          text.slice(mention.start + 1 + mention.query.length);
        editorRef.current.clearContent();
        editorRef.current.insertContent(next);
        setInput(next);
        setEditorContent(next);
        setMention(null);
      },
      [mention, setInput],
    );

    // onUpdate propagates the new text back through handleEditorChange.
    const insertAtCaret = useCallback((text: string) => {
      editorRef.current?.focus();
      editorRef.current?.insertContent(text);
    }, []);

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
          {/* No overflow clipping here: the editor scrolls itself, and the
              mention popup floats above the box. */}
          <div className="flex-1 flex h-full flex-col rounded-xl border border-border transition-all duration-200 bg-background">
            {replyTarget && (
              <div className="flex items-center gap-3 border-b border-border px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">
                    Replying to {replySenderName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {typeof replyTarget.content === "string"
                      ? replyTarget.content
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyTarget(null)}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Cancel reply"
                  title="Cancel reply"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            <ContextButtons
              selectedContent={selectedContent || null}
              onRejectSelectedContent={rejectSelectedContent}
            />

            <div className="drag-region relative w-full flex-1 px-1 pt-1">
              {mention !== null && (
                <div className="absolute bottom-full left-2 z-50 mb-1 w-64">
                  <MentionAutocomplete
                    ref={autocompleteRef}
                    members={members}
                    query={mention.query}
                    onSelect={handleMentionSelect}
                    onClose={() => setMention(null)}
                  />
                </div>
              )}
              <TiptapEditor
                ref={editorRef}
                content={editorContent || input}
                onChange={handleEditorChange}
                placeholder={placeholder}
                // Typing stays open while a reply streams: in a chat you draft
                // your next line while the other person is still talking, and
                // freezing the box loses whatever was half-typed.
                disabled={false}
                onSubmit={handleSubmit}
                autoFocus={true}
                onCaretChange={handleCaretChange}
                onKeyDownCapture={(event) => {
                  if (event.key === "Escape" && replyTargetId) {
                    setReplyTarget(null);
                    return true;
                  }
                  return autocompleteRef.current?.handleKeyDown(event) ?? false;
                }}
              />
            </div>

            <ChatInputButtons
              variant={variant}
              onStopGeneration={stopGeneration}
              onSendMessage={handleSubmit}
              onMention={() => insertAtCaret("@")}
              onInsertText={insertAtCaret}
              isLoading={isLoading}
              hasContent={!!editorContent.trim()}
            />
          </div>
        </div>
      </div>
    );
  },
);

ChatInput.displayName = "ChatInput";

export default ChatInput;
