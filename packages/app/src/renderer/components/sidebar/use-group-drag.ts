import React, { useRef, useState } from "react";
import {
  reorderGroups,
  type Group,
} from "@/renderer/libs/stores/channel-store";

export interface GroupDrag {
  draggingId: string | null;
  /** Groups in the order a drop would produce, so the list previews itself. */
  preview(groups: Group[]): Group[];
  headerHandlers(groupId: string): {
    onDragStart: (event: React.DragEvent) => void;
    onDragOver: (event: React.DragEvent) => void;
    onDrop: (event: React.DragEvent) => void;
    onDragEnd: () => void;
  };
}

/**
 * Dragging a whole group, by its header.
 *
 * Same shape as `useChannelDrag`, and for the same reason: the destination is
 * computed against geometry captured when the drag began. Hit-testing a layout
 * that the preview is actively moving oscillates wherever two answers meet.
 */
export function useGroupDrag(groups: Group[]): GroupDrag {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [targetIndex, setTargetIndex] = useState<number | null>(null);
  const middles = useRef<Array<{ id: string; middle: number }>>([]);

  const snapshot = () => {
    middles.current = groups.flatMap((group) => {
      const header = document.querySelector<HTMLElement>(
        `[${GROUP_HEADER_ATTR}="${CSS.escape(group.id)}"]`,
      );
      if (!header) return [];
      const box = header.getBoundingClientRect();
      return [{ id: group.id, middle: box.top + box.height / 2 }];
    });
  };

  const reset = () => {
    setDraggingId(null);
    setTargetIndex(null);
    middles.current = [];
  };

  return {
    draggingId,

    preview: (list) => {
      if (!draggingId || targetIndex === null) return list;
      const dragged = list.find((group) => group.id === draggingId);
      if (!dragged) return list;
      const without = list.filter((group) => group.id !== draggingId);
      const next = [...without];
      next.splice(targetIndex, 0, dragged);
      return next;
    },

    headerHandlers: (groupId) => ({
      onDragStart: (event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", groupId);
        // Stops the channel drag from also claiming this gesture.
        event.stopPropagation();
        snapshot();
        setDraggingId(groupId);
      },
      onDragOver: (event) => {
        if (!draggingId) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        const index = middles.current.filter(
          (row) => row.id !== draggingId && row.middle < event.clientY,
        ).length;
        setTargetIndex((current) => (current === index ? current : index));
      },
      onDrop: (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (draggingId && targetIndex !== null) {
          const without = groups
            .map((group) => group.id)
            .filter((id) => id !== draggingId);
          without.splice(targetIndex, 0, draggingId);
          void reorderGroups(without);
        }
        reset();
      },
      onDragEnd: reset,
    }),
  };
}

export const GROUP_HEADER_ATTR = "data-group-header";
