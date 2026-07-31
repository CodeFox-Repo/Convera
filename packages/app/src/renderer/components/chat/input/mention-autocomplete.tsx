import { membersMatching } from "@/renderer/libs/mention-parser";
import { cn } from "@/renderer/libs/utils/tailwind";
import type { Member } from "@/shared/types/workspace";
import { MemberAvatar } from "@/renderer/components/common/member-avatar";
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";

interface MentionAutocompleteProps {
  members: Member[];
  /** Text typed after the `@`; null closes the popup. */
  query: string | null;
  onSelect: (member: Member) => void;
  onClose: () => void;
}

export interface MentionAutocompleteRef {
  /**
   * Feed the editor's keydown here; true means the popup consumed the key.
   *
   * The editor owns the caret, so it must keep the event unless we took it —
   * ProseMirror's `handleKeyDown` uses the same true/false contract.
   */
  handleKeyDown: (event: KeyboardEvent) => boolean;
}

const MentionAutocomplete = forwardRef<
  MentionAutocompleteRef,
  MentionAutocompleteProps
>(({ members, query, onSelect, onClose }, ref) => {
  const [active, setActive] = useState(0);

  const matches = useMemo(
    () => (query === null ? [] : membersMatching(query, members)),
    [query, members],
  );

  useEffect(() => setActive(0), [query]);

  useImperativeHandle(ref, () => ({
    handleKeyDown: (event) => {
      if (!matches.length) return false;

      switch (event.key) {
        case "ArrowDown":
          setActive((index) => (index + 1) % matches.length);
          return true;
        case "ArrowUp":
          setActive((index) => (index - 1 + matches.length) % matches.length);
          return true;
        case "Enter":
        case "Tab":
          onSelect(matches[active]);
          return true;
        case "Escape":
          onClose();
          return true;
        default:
          return false;
      }
    },
  }));

  if (!matches.length) return null;

  return (
    <div
      role="listbox"
      aria-label="Mention a member"
      // Overlay surface: floats above messages, so it gets the popover
      // material like every other floating panel (dialog, dropdown, select).
      className="bg-popover text-popover-foreground max-h-56 overflow-auto rounded-lg border border-border p-1 shadow-md"
    >
      {matches.map((member, index) => (
        <button
          key={member.id}
          role="option"
          aria-selected={index === active}
          onMouseEnter={() => setActive(index)}
          // mousedown, not click: click fires after the editor has already lost focus.
          onMouseDown={(event) => {
            event.preventDefault();
            onSelect(member);
          }}
          className={cn(
            "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-foreground",
            index === active && "bg-muted",
          )}
        >
          <MemberAvatar member={member} className="size-5" />
          <span className="truncate">{member.name}</span>
        </button>
      ))}
    </div>
  );
});

MentionAutocomplete.displayName = "MentionAutocomplete";

export default MentionAutocomplete;
