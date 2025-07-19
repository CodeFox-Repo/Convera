import {
  SelectedContent,
  useChatContext,
} from "@/renderer/libs/stores/chat-store";
import { File, Monitor, Plus, X } from "lucide-react";
import React, { useEffect, useState } from "react";

interface ContextButtonsProps {
  selectedContent: SelectedContent | null;
  formatAppName: (name: string) => string;
  onRejectSelectedContent: () => void;
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

// const ScreenshotModal = ({
//   imageData,
//   isOpen,
//   onClose,
// }: {
//   imageData: string;
//   isOpen: boolean;
//   onClose: () => void;
// }) => {
//   if (!isOpen) return null;

//   const imageSrc = imageData.startsWith("data:")
//     ? imageData
//     : `data:image/png;base64,${imageData}`;

//   return (
//     <div
//       className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 no-drag-region"
//       onClick={onClose}
//     >
//       <div className="relative max-w-[90vw] max-h-[90vh] p-4">
//         <img
//           src={imageSrc}
//           alt="Screenshot preview"
//           className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
//           onClick={(e) => e.stopPropagation()}
//         />
//         <button
//           onClick={onClose}
//           className="absolute top-2 right-2 w-8 h-8 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white transition-colors"
//           aria-label="Close preview"
//         >
//           <X size={16} />
//         </button>
//       </div>
//     </div>
//   );
// };

// const ScreenshotBadge = ({
//   imageData,
//   index,
//   onClear,
// }: {
//   imageData: string;
//   index: number;
//   onClear: () => void;
// }) => {
//   const [isModalOpen, setIsModalOpen] = useState(false);

//   const imageSrc = imageData.startsWith("data:")
//     ? imageData
//     : `data:image/png;base64,${imageData}`;

//   return (
//     <>
//       <div
//         className="group relative h-6 no-drag-region flex items-center rounded-2xl border border-gray-500/45
//           bg-background/30 px-2 py-1 text-xs font-medium overflow-hidden pr-5 cursor-pointer hover:bg-background/40 transition-colors"
//         onClick={() => setIsModalOpen(true)}
//         title="Click to view full size"
//       >
//         <div className="size-4 flex-shrink-0 mr-1 rounded overflow-hidden">
//           <img src={imageSrc} alt="" className="size-full object-cover" />
//         </div>
//         <span className="truncate -mr-1">Screenshot {index + 1}</span>
//         <button
//           onClick={(e) => {
//             e.stopPropagation();
//             onClear();
//           }}
//           className="absolute right-0 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity focus:outline-none no-drag-region"
//           aria-label="Clear screenshots"
//         >
//           <X size={12} />
//         </button>
//       </div>

//       <ScreenshotModal
//         imageData={imageData}
//         isOpen={isModalOpen}
//         onClose={() => setIsModalOpen(false)}
//       />
//     </>
//   );
// };

export function ContextButtons({
  selectedContent,
  formatAppName,
  onRejectSelectedContent,
  onAddFile,
}: ContextButtonsProps) {
  const { attachments, removeAttachment } = useChatContext();
  const MAX_VISIBLE_FILES = 2;
  const remainingFiles =
    attachments.length > MAX_VISIBLE_FILES
      ? attachments.length - MAX_VISIBLE_FILES
      : 0;
  const visibleFiles = attachments.slice(0, MAX_VISIBLE_FILES);

  const hasContexts = !!selectedContent || attachments.length > 0;

  return (
    <div className="h-7.5 pt-1 overflow-hidden">
      <div className="px-2 w-full overflow-x-auto overflow-y-hidden whitespace-nowrap hide-scrollbar">
        <div className="inline-flex items-center gap-1 h-7">
          <button
            className={`h-6 no-drag-region flex items-center rounded-2xl border border-gray-500/45
                bg-background/30 text-xs font-medium hover:bg-background/50 transition-colors
                ${hasContexts ? "px-1 py-1 aspect-square" : "px-3 py-1 max-w-[36ch]"}`}
            onClick={onAddFile}
            title="Add context"
          >
            <Plus size={14} className="flex-shrink-0" />
            {!hasContexts && (
              <span className="ml-1 mt-1">{formatAppName("Add context")}</span>
            )}
          </button>

          {selectedContent && (
            <>
              {/* Text content badge */}
              {selectedContent.text && (
                <div
                  className="group relative h-6 no-drag-region flex items-center rounded-2xl border border-gray-500/45
                    bg-background/30 px-2 py-1 text-xs font-medium max-w-[24ch] overflow-hidden pr-5"
                >
                  <Monitor size={12} className="flex-shrink-0 mr-1" />
                  <span className="truncate -mr-1">
                    {selectedContent.text.slice(0, 30) +
                      (selectedContent.text.length > 30 ? "..." : "")}
                  </span>
                  <button
                    onClick={onRejectSelectedContent}
                    className="absolute right-0 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity focus:outline-none no-drag-region"
                    aria-label="Clear selected content"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
            </>
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
