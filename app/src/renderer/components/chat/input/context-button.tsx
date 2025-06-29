import {
  useChatContext,
  ClipboardContent,
} from "@/renderer/libs/stores/chat-store";
import { File, Monitor, Plus, X } from "lucide-react";
import React, { useEffect, useState } from "react";

interface ContextButtonsProps {
  copiedContent: ClipboardContent | null;
  formatAppName: (name: string) => string;
  onRejectCopiedContent: () => void;
  onAddFile?: () => void;
}

const FileBadge = ({
  file,
  onRemove,
}: {
  file: File;
  onRemove: () => void;
}) => {
  const [preview, setPreview] = useState<string | null>(null);
  const isImage = file.type.startsWith("image/");

  useEffect(() => {
    if (isImage) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }

    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [file, isImage]);

  return (
    <div
      className="group relative h-6 no-drag-region flex items-center rounded-2xl border border-gray-500/45
        bg-background/30 px-2 py-1 text-xs font-medium max-w-[16ch] overflow-hidden pr-5"
    >
      {isImage && preview ? (
        <div className="size-4 flex-shrink-0 mr-1 rounded overflow-hidden">
          <img src={preview} alt="" className="size-full object-cover" />
        </div>
      ) : (
        <File size={12} className="flex-shrink-0 mr-1" />
      )}
      <span className="truncate -mr-1">{file.name}</span>
      <button
        onClick={onRemove}
        className="absolute right-0 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity focus:outline-none no-drag-region"
        aria-label="Remove file"
      >
        <X size={12} />
      </button>
    </div>
  );
};

const RemainingFilesBadge = ({ count }: { count: number }) => {
  return (
    <div
      className="h-6 no-drag-region flex items-center justify-center rounded-2xl border border-gray-500/45
        bg-background/30 px-3 py-1 text-xs font-medium text-foreground/80"
    >
      +{count}
    </div>
  );
};

export function ContextButtons({
  copiedContent,
  formatAppName,
  onRejectCopiedContent,
  onAddFile,
}: ContextButtonsProps) {
  const { attachments, removeAttachment } = useChatContext();
  const MAX_VISIBLE_FILES = 2;
  const remainingFiles =
    attachments.length > MAX_VISIBLE_FILES
      ? attachments.length - MAX_VISIBLE_FILES
      : 0;
  const visibleFiles = attachments.slice(0, MAX_VISIBLE_FILES);

  const hasContexts = !!copiedContent || attachments.length > 0;

  return (
    <div className="h-7.5 pt-1 overflow-hidden">
      <div className="px-2 w-full overflow-x-auto overflow-y-hidden whitespace-nowrap hide-scrollbar">
        <div className="inline-flex items-center gap-1 h-7">
          <button
            className={`h-6 no-drag-region flex items-center rounded-2xl border border-gray-500/45
                bg-background/30 text-xs font-medium hover:bg-background/50 transition-colors
                ${hasContexts ? "px-2 py-1 aspect-square" : "px-3 py-1 max-w-[36ch]"}`}
            onClick={onAddFile}
            title="Add context"
          >
            <Plus size={14} className="flex-shrink-0" />
            {!hasContexts && (
              <span className="ml-1">{formatAppName("Add context")}</span>
            )}
          </button>

          {copiedContent && (
            <div
              className="group relative h-6 no-drag-region flex items-center rounded-2xl border border-gray-500/45
                bg-background/30 px-2 py-1 text-xs font-medium max-w-[16ch] overflow-hidden pr-5"
            >
              <Monitor size={12} className="flex-shrink-0 mr-1" />
              <span className="truncate -mr-1">
                {formatAppName("clipboard")}
              </span>
              <button
                onClick={onRejectCopiedContent}
                className="absolute right-0 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity focus:outline-none no-drag-region"
                aria-label="Clear clipboard content"
              >
                <X size={12} />
              </button>
            </div>
          )}

          {visibleFiles.map((file, index) => (
            <FileBadge
              key={index}
              file={file}
              onRemove={() => removeAttachment(index)}
            />
          ))}

          {remainingFiles > 0 && <RemainingFilesBadge count={remainingFiles} />}
        </div>
      </div>
    </div>
  );
}

if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = `
    .hide-scrollbar::-webkit-scrollbar {
      display: none;
    }
    .hide-scrollbar {
      -ms-overflow-style: none;
      scrollbar-width: none;
    }
  `;
  document.head.appendChild(style);
}
