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
  /**
   * Runs before the built-in Enter-to-submit handling; return true to consume
   * the key. Lets the mention autocomplete intercept arrows/Enter/Escape while
   * it is open.
   */
  onKeyDownCapture?: (event: KeyboardEvent) => boolean;
  /** Caret offset in plain text after each update, for mention detection. */
  onCaretChange?: (caret: number, text: string) => void;
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
      onKeyDownCapture,
      onCaretChange,
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
        // textBetween with the same separator getText uses keeps offsets aligned.
        const caret = editor.state.doc.textBetween(
          0,
          editor.state.selection.from,
          "\n\n",
        ).length;
        onCaretChange?.(caret, editor.getText());
      },
      onSelectionUpdate: ({ editor }) => {
        const caret = editor.state.doc.textBetween(
          0,
          editor.state.selection.from,
          "\n\n",
        ).length;
        onCaretChange?.(caret, editor.getText());
      },
      editorProps: {
        handleKeyDown: (view, event) => {
          if (onKeyDownCapture?.(event)) {
            event.preventDefault();
            return true;
          }
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

    // The extension captured `placeholder` at creation, so switching rooms
    // would keep addressing the old one until the editor was remounted.
    useEffect(() => {
      const extension = editor?.extensionManager.extensions.find(
        (candidate) => candidate.name === "placeholder",
      );
      if (!editor || !extension) return;
      extension.options.placeholder = placeholder;
      editor.view.dispatch(editor.state.tr);
    }, [placeholder, editor]);

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
