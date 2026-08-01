import { BaseLogo } from "@/renderer/components/common/base-logo";
import { cn } from "@/renderer/libs/utils/tailwind";
import type { Member } from "@/shared/types/workspace";
import { User } from "lucide-react";
import React from "react";

/**
 * The built-in assistant's member id. Its identity mark is the product logo,
 * decided HERE rather than by each caller passing a fallback — that contract
 * already failed twice, one forgotten call site at a time.
 */
const ASSISTANT_MEMBER_ID = "agent:default";

/**
 * THE member avatar. Every surface — message rows, roster pane, mention
 * popup, org list — renders identity through this one component so a member
 * looks the same everywhere: circle for humans, rounded square for agents;
 * emoji avatar when the member has one, initial otherwise.
 */
export function MemberAvatar({
  member,
  className,
  isHuman: isHumanOverride,
  fallback,
}: {
  member: Member | undefined;
  className?: string;
  /** For legacy rows with no member, role decides the shape. */
  isHuman?: boolean;
  /** Rendered when there is no member and no avatar (e.g. brand logo). */
  fallback?: React.ReactNode;
}) {
  const isHuman = member ? member.kind === "human" : (isHumanOverride ?? true);

  return (
    <span
      className={cn(
        "flex items-center justify-center overflow-hidden bg-muted text-[10px] font-medium uppercase text-muted-foreground ring-1 ring-border",
        isHuman ? "rounded-full" : "rounded-md",
        className,
      )}
    >
      {member?.avatar ? (
        member.avatar.startsWith("data:") ? (
          <img src={member.avatar} alt="" className="size-full object-cover" />
        ) : (
          <span className="text-[1.1em] leading-none">{member.avatar}</span>
        )
      ) : member?.id === ASSISTANT_MEMBER_ID ? (
        <BaseLogo size={20} />
      ) : (
        // A member without a portrait still prefers the caller's fallback (the
        // product logo for the built-in assistant) over its bare initial —
        // otherwise the same speaker renders as a logo in one row and a letter
        // in the next, depending only on whether its member row had loaded.
        (fallback ?? (member ? member.name.charAt(0) : <User size={12} />))
      )}
    </span>
  );
}
