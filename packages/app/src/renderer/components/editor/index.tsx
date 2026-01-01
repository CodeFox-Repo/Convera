import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import React, { forwardRef, useEffect, useImperativeHandle } from "react";

export interface TiptapEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  disabled?: boolean;
  onSubmit?: () => void;
  autoFocus?: boolean;
}

export interface TiptapEditorRef {
  focus: () => void;
  clearContent: () => void;
  getHTML: () => string;
  getText: () => string;
  insertContent: (text: string) => void;
  isFocused: () => boolean;
}

const TiptapEditor = forwardRef<TiptapEditorRef, TiptapEditorProps>(
  (
    {
      content,
      onChange,
      placeholder = "Message...",
      disabled = false,
      onSubmit,
      autoFocus = false,
    },
    ref,
  ) => {
    // Initialize editor
    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          bulletList: false,
          orderedList: false,
          codeBlock: false,
          heading: false,
          horizontalRule: false,
          blockquote: false,
        }),
        Placeholder.configure({
          placeholder,
          emptyEditorClass: "is-editor-empty",
        }),
      ],
      content,
      editable: !disabled,
      autofocus: autoFocus,
      injectCSS: false,
      onUpdate: ({ editor }) => {
        onChange(editor.getText());
      },
      editorProps: {
        handleKeyDown: (view, event) => {
          // Submit on Enter without Shift key
          if (event.key === "Enter" && !event.shiftKey && onSubmit) {
            event.preventDefault();
            onSubmit();
            return true;
          }
          return false;
        },
      },
    });

    // Expose methods to parent component
    useImperativeHandle(ref, () => ({
      focus: () => {
        editor?.commands.focus("end");
      },
      clearContent: () => {
        editor?.commands.clearContent();
      },
      getHTML: () => {
        return editor?.getHTML() || "";
      },
      getText: () => {
        return editor?.getText() || "";
      },
      insertContent: (text: string) => {
        editor?.commands.insertContent(text);
      },
      isFocused: () => {
        return editor?.isFocused || false;
      },
    }));

    // Update editor content when prop changes
    useEffect(() => {
      if (editor && editor.getHTML() !== content && !editor.isFocused) {
        editor.commands.setContent(content);
      }
    }, [content, editor]);

    // Update disabled state when prop changes
    useEffect(() => {
      if (editor) {
        editor.setEditable(!disabled);
      }
    }, [disabled, editor]);

    return (
      <div
        className={`no-drag-region tiptap-editor h-auto ${disabled ? "cursor-not-allowed opacity-60" : "cursor-text"}`}
      >
        <EditorContent editor={editor} />
      </div>
    );
  },
);

TiptapEditor.displayName = "TiptapEditor";

export default TiptapEditor;
