import { cn } from "@/renderer/libs/utils/tailwind";
import { User } from "lucide-react";
import React from "react";

/**
 * Shape carries the human/agent distinction — circle for people, rounded square
 * for agents — so it survives colour blindness. Same rule as the message rows.
 */
export function TalentAvatar({
  emoji,
  kind,
  size = 40,
}: {
  emoji: string | null;
  kind: "human" | "agent";
  size?: number;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center bg-muted ring-1 ring-border flex-shrink-0",
        kind === "human" ? "rounded-full" : "rounded-md",
      )}
      style={{ width: size, height: size }}
    >
      {emoji ? (
        <span style={{ fontSize: size * 0.5 }} className="leading-none">
          {emoji}
        </span>
      ) : (
        <User
          size={size * 0.4}
          className="text-muted-foreground"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
