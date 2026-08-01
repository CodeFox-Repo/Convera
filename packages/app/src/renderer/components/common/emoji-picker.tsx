import {
  EmojiPicker,
  type EmojiPickerListCategoryHeaderProps,
  type EmojiPickerListEmojiProps,
  type EmojiPickerListRowProps,
} from "frimousse";
import React from "react";

function CategoryHeader({
  category,
  ...props
}: EmojiPickerListCategoryHeaderProps) {
  return (
    <div
      className="text-muted-foreground px-3 pt-3 pb-1.5 text-xs font-medium"
      {...props}
    >
      {category.label}
    </div>
  );
}

function Row({ children, ...props }: EmojiPickerListRowProps) {
  return (
    <div className="scroll-my-1.5 px-1.5" {...props}>
      {children}
    </div>
  );
}

function Emoji({ emoji, ...props }: EmojiPickerListEmojiProps) {
  return (
    <button
      type="button"
      className="data-[active]:bg-muted flex size-8 items-center justify-center rounded-md text-lg"
      {...props}
    >
      {emoji.emoji}
    </button>
  );
}

const listComponents = { CategoryHeader, Row, Emoji };

export function FullEmojiPicker({
  onPick,
}: {
  onPick: (emoji: string) => void;
}) {
  return (
    <EmojiPicker.Root
      className="isolate flex h-[300px] w-[320px] flex-col"
      sticky={false}
      onEmojiSelect={({ emoji }) => onPick(emoji)}
    >
      <EmojiPicker.Search className="border-border placeholder:text-muted-foreground mx-1 mt-1 appearance-none rounded-md border px-2.5 py-1.5 text-sm outline-none" />
      <EmojiPicker.Viewport className="relative flex-1 outline-hidden">
        <EmojiPicker.Loading className="text-muted-foreground absolute inset-0 flex items-center justify-center text-sm">
          Loading…
        </EmojiPicker.Loading>
        <EmojiPicker.Empty className="text-muted-foreground absolute inset-0 flex items-center justify-center text-sm">
          No emoji found
        </EmojiPicker.Empty>
        <EmojiPicker.List
          className="pb-1.5 select-none"
          components={listComponents}
        />
      </EmojiPicker.Viewport>
    </EmojiPicker.Root>
  );
}
