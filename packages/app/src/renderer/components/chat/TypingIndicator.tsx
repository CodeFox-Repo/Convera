import { MemberAvatar } from "@/renderer/components/common/member-avatar";
import { useMembers } from "@/renderer/libs/stores/member-store";
import { useTypingStore } from "@/renderer/libs/stores/typing-store";
import React from "react";

/**
 * "Elena is typing…", driven by an agent actually reaching for its speech tool.
 *
 * This exists because nothing is placed in the transcript until the agent
 * commits to speaking: without it a room would sit silent while somebody
 * composes. It deliberately does not occupy a message row — it is a hint that
 * someone is about to speak, not a claim that they did.
 */
export function TypingIndicator({
  conversationId,
}: {
  conversationId?: string | null;
}) {
  const typing = useTypingStore((state) => state.typing);
  const members = useMembers();

  const names = conversationId
    ? [
        ...new Set(
          Object.values(typing)
            .filter((entry) => entry.conversationId === conversationId)
            .map((entry) => entry.memberId),
        ),
      ]
    : [];
  if (names.length === 0) return null;

  const byId = new Map((members ?? []).map((member) => [member.id, member]));
  const present = names.flatMap((id) => {
    const member = byId.get(id);
    return member ? [member] : [];
  });
  if (present.length === 0) return null;

  const label =
    present.length === 1
      ? `${present[0].name} is typing`
      : present.length === 2
        ? `${present[0].name} and ${present[1].name} are typing`
        : `${present[0].name} and ${present.length - 1} others are typing`;

  return (
    <div className="flex items-center gap-2 px-2 pb-1 text-xs text-muted-foreground">
      <span className="flex items-center -space-x-1.5">
        {present.slice(0, 3).map((member) => (
          <MemberAvatar key={member.id} member={member} className="size-4" />
        ))}
      </span>
      <span className="truncate">{label}</span>
      <span className="flex gap-0.5" aria-hidden="true">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="size-1 animate-bounce rounded-full bg-muted-foreground"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
    </div>
  );
}
