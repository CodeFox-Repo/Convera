import { cn } from "@/renderer/libs/utils/tailwind";
import type { Member } from "@/shared/types/workspace";
import { Bot } from "lucide-react";
import React from "react";

interface MentionChipProps {
  member: Pick<Member, "name" | "kind">;
  className?: string;
}

/** Inline `@Name` chip rendered in message bodies and the composer. */
export function MentionChip({ member, className }: MentionChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1 align-baseline text-primary",
        className,
      )}
    >
      {member.kind === "agent" && <Bot className="h-3 w-3" />}@{member.name}
    </span>
  );
}
