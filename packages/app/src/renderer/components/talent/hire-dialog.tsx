import { Button } from "@/renderer/components/ui/button";
import { Checkbox } from "@/renderer/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/renderer/components/ui/dialog";
import type { AgentTemplate } from "@/renderer/libs/agent-templates";
import { useVisibleChannels } from "@/renderer/libs/stores/channel-store";
import { Hash, Lock } from "lucide-react";
import React, { useEffect, useState } from "react";

/**
 * Hiring asks which rooms they walk into, because that is the whole difference
 * between a colleague and a row in a table: an agent in no channel is never
 * routed a message, so a hire without a room is a hire that does nothing.
 *
 * The rooms are pre-checked rather than empty — someone hiring a reviewer wants
 * them at work, not parked — and unchecking every one stays allowed for the case
 * where the desk is picked later.
 */
export function HireDialog({
  template,
  onConfirm,
  onOpenChange,
}: {
  template: AgentTemplate | null;
  onConfirm: (channelIds: string[]) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const channels = useVisibleChannels();
  const rooms = (channels ?? []).filter((channel) => channel.kind !== "dm");
  const [selected, setSelected] = useState<string[] | null>(null);

  // Every room, until the user says otherwise. Reset per template so the
  // previous hire's choice does not carry into the next one.
  useEffect(() => {
    setSelected(null);
  }, [template?.id]);
  const checked = selected ?? rooms.map((room) => room.id);

  const toggle = (id: string) =>
    setSelected(
      checked.includes(id)
        ? checked.filter((value) => value !== id)
        : [...checked, id],
    );

  return (
    <Dialog open={template !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hire {template?.name ?? ""}?</DialogTitle>
          <DialogDescription>
            {template?.name ?? ""} joins this workspace as{" "}
            {template?.role.toLowerCase() ?? "an agent"}. Pick the rooms they
            start in — they only see messages in channels they are a member of.
          </DialogDescription>
        </DialogHeader>

        {rooms.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You have no channels yet. Hire them now and add them to a room from
            the channel member list later.
          </p>
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {rooms.map((room) => (
              <label
                key={room.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent"
              >
                <Checkbox
                  checked={checked.includes(room.id)}
                  onCheckedChange={() => toggle(room.id)}
                  aria-label={room.name}
                />
                {room.isPrivate ? (
                  <Lock
                    size={13}
                    className="flex-shrink-0 text-muted-foreground"
                  />
                ) : (
                  <Hash
                    size={13}
                    className="flex-shrink-0 text-muted-foreground"
                  />
                )}
                <span className="min-w-0 flex-1 truncate">{room.name}</span>
              </label>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(checked)}>
            {checked.length === 0
              ? "Hire"
              : `Hire into ${checked.length} channel${
                  checked.length === 1 ? "" : "s"
                }`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
