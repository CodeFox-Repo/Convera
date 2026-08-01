import React, { useRef, useState } from "react";
import {
  reorderChannels,
  type Channel,
} from "@/renderer/libs/stores/channel-store";

/** Where the drop would land. Null while the pointer is outside any group. */
interface DropTarget {
  groupId: string | null;
  index: number;
}

interface RowBox {
  id: string;
  groupId: string | null;
  middle: number;
}

export interface ChannelDrag {
  draggingId: string | null;
  /**
   * One group's channels as they would be if the drag ended now, so the list
   * itself shows the outcome — the gap opening under the cursor is the drop
   * indicator. Identical to the list when nothing is being dragged.
   */
  previewFor(groupId: string | null): Channel[];
  itemHandlers(channel: Channel): {
    onDragStart: (event: React.DragEvent) => void;
    onDragEnd: () => void;
  };
  /** The list body owns hit-testing: it covers every row inside it. */
  groupHandlers(groupId: string | null): {
    onDragOver: (event: React.DragEvent) => void;
    onDrop: (event: React.DragEvent) => void;
  };
}

export const CHANNEL_LIST_ATTR = "data-channel-list";
export const CHANNEL_ROW_ATTR = "data-channel-row";

/** A group id round-trips through the DOM, where null has to be spelled out. */
const NO_GROUP = "\0none";
export const groupAttr = (groupId: string | null) => groupId ?? NO_GROUP;
const groupFromAttr = (value: string) => (value === NO_GROUP ? null : value);

/**
 * Native HTML5 drag — the payload is only the channel id, and the authoritative
 * list is recomputed from the store on drop, so a stale render can never write
 * a wrong order.
 */
export function useChannelDrag(channels: Channel[]): ChannelDrag {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  // Row positions as they were when the drag began.
  //
  // Hit-testing against the live layout is a feedback loop: previewing the
  // drop moves the rows, which changes what the pointer is over, which moves
  // them back — the list shudders wherever two of those answers meet. Frozen
  // geometry breaks the loop, and because the pointer is compared against
  // fixed midpoints the resulting index only ever grows as it descends.
  const geometry = useRef<RowBox[]>([]);

  const inGroup = (groupId: string | null) =>
    channels
      .filter((channel) => channel.groupId === groupId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const snapshot = () => {
    const rows: RowBox[] = [];
    for (const list of Array.from(
      document.querySelectorAll(`[${CHANNEL_LIST_ATTR}]`),
    )) {
      const groupId = groupFromAttr(list.getAttribute(CHANNEL_LIST_ATTR) ?? "");
      for (const row of Array.from(
        list.querySelectorAll(`[${CHANNEL_ROW_ATTR}]`),
      )) {
        const box = row.getBoundingClientRect();
        rows.push({
          id: row.getAttribute(CHANNEL_ROW_ATTR) ?? "",
          groupId,
          middle: box.top + box.height / 2,
        });
      }
    }
    geometry.current = rows;
  };

  const reset = () => {
    setDraggingId(null);
    setTarget(null);
    geometry.current = [];
  };

  /** How many of a group's rows sit above the pointer, ignoring the dragged one. */
  const indexAt = (groupId: string | null, clientY: number) =>
    geometry.current.filter(
      (row) =>
        row.groupId === groupId &&
        row.id !== draggingId &&
        row.middle < clientY,
    ).length;

  const commit = async (groupId: string | null, index: number) => {
    if (!draggingId) return;
    const ordered = inGroup(groupId)
      .map((channel) => channel.id)
      .filter((id) => id !== draggingId);
    ordered.splice(index, 0, draggingId);
    await reorderChannels(groupId, ordered);
  };

  return {
    draggingId,

    previewFor: (groupId) => {
      const stored = inGroup(groupId);
      if (!draggingId || !target) return stored;
      const dragged = channels.find((channel) => channel.id === draggingId);
      if (!dragged) return stored;
      const without = stored.filter((channel) => channel.id !== draggingId);
      if (target.groupId !== groupId) return without;
      const next = [...without];
      next.splice(target.index, 0, dragged);
      return next;
    },

    itemHandlers: (channel) => ({
      onDragStart: (event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", channel.id);
        // Before React repaints anything, so this is the resting layout.
        snapshot();
        setDraggingId(channel.id);
      },
      onDragEnd: reset,
    }),

    groupHandlers: (groupId) => ({
      onDragOver: (event) => {
        if (!draggingId) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        const index = indexAt(groupId, event.clientY);
        // dragover fires continuously; only a landing position that actually
        // changed is worth a render, or the spring restarts mid-flight.
        setTarget((current) =>
          current?.groupId === groupId && current.index === index
            ? current
            : { groupId, index },
        );
      },
      onDrop: (event) => {
        event.preventDefault();
        // Commit exactly what the preview showed, so the list never settles
        // somewhere other than the gap the user was aiming at.
        if (target) void commit(target.groupId, target.index);
        reset();
      },
    }),
  };
}
