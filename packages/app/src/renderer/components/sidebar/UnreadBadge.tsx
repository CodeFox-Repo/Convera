import React from "react";

/** Past 99 the exact number stops being information. */
export function formatUnread(count: number): string {
  return count > 99 ? "99+" : String(count);
}

export function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="ml-auto min-w-4 flex-shrink-0 rounded-full bg-primary px-1 text-center text-[10px] font-semibold leading-4 text-primary-foreground"
      aria-label={`${count} unread`}
    >
      {formatUnread(count)}
    </span>
  );
}
