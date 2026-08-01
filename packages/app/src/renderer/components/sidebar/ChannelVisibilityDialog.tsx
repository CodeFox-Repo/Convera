import React, { useEffect, useMemo, useState } from "react";
import { Globe, Plus, Tag as TagIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/renderer/components/ui/dialog";
import { Checkbox } from "@/renderer/components/ui/checkbox";
import type { Channel } from "@/renderer/libs/stores/channel-store";
import {
  normalizeTagName,
  setChannelVisibility,
  useTags,
} from "@/renderer/libs/stores/tag-store";
import { cn } from "@/renderer/libs/utils/tailwind";
import { InlineNameInput } from "./InlineNameInput";

/**
 * Who can find this channel.
 *
 * The wording is deliberate: this controls *discovery*, not just entry. A
 * channel whose tags you lack does not appear in your sidebar or in an
 * agent's `list_channels`, and asking for it by id answers exactly as it
 * would for a channel that does not exist.
 */
export function ChannelVisibilityDialog({
  channel,
  open,
  onOpenChange,
}: {
  channel: Channel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const tags = useTags();
  const [selected, setSelected] = useState<string[]>([]);
  const [isAddingTag, setIsAddingTag] = useState(false);

  // Reopening after a change elsewhere should show the stored audience, not
  // whatever was last toggled in a previous session of this dialog.
  useEffect(() => {
    if (open) {
      setSelected(channel.visibleToTags ?? []);
      setIsAddingTag(false);
    }
  }, [open, channel.visibleToTags]);

  const known = useMemo(() => (tags ?? []).map((tag) => tag.name), [tags]);
  // A tag can be required by a channel before its row exists (or after it was
  // deleted); show it anyway so it can be seen and switched off.
  const options = useMemo(
    () => [...new Set([...known, ...selected])].sort(),
    [known, selected],
  );
  const isOpenToAll = selected.length === 0;

  const toggle = (name: string) =>
    setSelected((current) =>
      current.includes(name)
        ? current.filter((held) => held !== name)
        : [...current, name],
    );

  const save = async () => {
    await setChannelVisibility(channel.id, selected);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Who can find #{channel.name}</DialogTitle>
          <DialogDescription>
            Holding any one of the selected tags is enough. This controls
            discovery: without a tag, the channel does not appear in the sidebar
            or in an agent&apos;s search at all.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setSelected([])}
            className={cn(
              "flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors pointer-events-auto",
              isOpenToAll ? "bg-sidebar-accent" : "hover:bg-sidebar-hover",
            )}
          >
            <Globe size={15} className="mt-0.5 shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-medium">
                Everyone in the workspace
              </span>
              <span className="block text-xs text-muted-foreground">
                Anyone can find and read it, including agents.
              </span>
            </span>
          </button>

          <div className="max-h-64 space-y-0.5 overflow-y-auto pt-1">
            {options.map((name) => (
              <label
                key={name}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-sidebar-hover"
              >
                <Checkbox
                  checked={selected.includes(name)}
                  onCheckedChange={() => toggle(name)}
                />
                <TagIcon size={13} className="shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
              </label>
            ))}
          </div>

          {isAddingTag ? (
            <div className="px-1 pt-1">
              <InlineNameInput
                placeholder="Tag name"
                onSubmit={(name) => {
                  const normalized = normalizeTagName(name);
                  // Created for real on save, alongside the channel update.
                  if (normalized && !selected.includes(normalized)) {
                    setSelected((current) => [...current, normalized]);
                  }
                  setIsAddingTag(false);
                }}
                onCancel={() => setIsAddingTag(false)}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsAddingTag(true)}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors pointer-events-auto hover:text-sidebar-foreground"
            >
              <Plus size={12} />
              <span>New tag</span>
            </button>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors pointer-events-auto hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity pointer-events-auto hover:opacity-90"
          >
            Save
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
