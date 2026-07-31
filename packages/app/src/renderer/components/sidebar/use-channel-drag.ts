import React, { useState } from "react";
import {
  reorderChannels,
  type Channel,
} from "@/renderer/libs/stores/channel-store";

type DropEdge = "above" | "below";

interface DropTarget {
  channelId: string;
  edge: DropEdge;
}

export interface ChannelDrag {
  draggingId: string | null;
  dropEdgeFor(channelId: string): DropEdge | null;
  /** Highlight a group header when a channel is hovering over an empty group. */
  hoveredGroupId: string | null | undefined;
  itemHandlers(channel: Channel): {
    onDragStart: (event: React.DragEvent) => void;
    onDragOver: (event: React.DragEvent) => void;
    onDrop: (event: React.DragEvent) => void;
    onDragEnd: () => void;
  };
  /** Drop onto a group's body: appends to the end of that group. */
  groupHandlers(groupId: string | null): {
    onDragOver: (event: React.DragEvent) => void;
    onDrop: (event: React.DragEvent) => void;
  };
}

/**
 * Native HTML5 drag — the payload is only the channel id, and the authoritative
 * list is recomputed from the store on drop, so a stale render can never write
 * a wrong order.
 */
export function useChannelDrag(channels: Channel[]): ChannelDrag {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const [hoveredGroupId, setHoveredGroupId] = useState<
    string | null | undefined
  >(undefined);

  const inGroup = (groupId: string | null) =>
    channels
      .filter((channel) => channel.groupId === groupId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const reset = () => {
    setDraggingId(null);
    setTarget(null);
    setHoveredGroupId(undefined);
  };

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
    hoveredGroupId,
    dropEdgeFor: (channelId) =>
      target?.channelId === channelId ? target.edge : null,

    itemHandlers: (channel) => ({
      onDragStart: (event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", channel.id);
        setDraggingId(channel.id);
      },
      onDragOver: (event) => {
        if (!draggingId || draggingId === channel.id) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        const box = event.currentTarget.getBoundingClientRect();
        setTarget({
          channelId: channel.id,
          edge: event.clientY < box.top + box.height / 2 ? "above" : "below",
        });
        setHoveredGroupId(undefined);
      },
      onDrop: (event) => {
        event.preventDefault();
        event.stopPropagation();
        const edge = target?.channelId === channel.id ? target.edge : "above";
        const ordered = inGroup(channel.groupId)
          .map((item) => item.id)
          .filter((id) => id !== draggingId);
        const at = ordered.indexOf(channel.id);
        void commit(channel.groupId, edge === "above" ? at : at + 1);
        reset();
      },
      onDragEnd: reset,
    }),

    groupHandlers: (groupId) => ({
      onDragOver: (event) => {
        if (!draggingId) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setHoveredGroupId(groupId);
        setTarget(null);
      },
      onDrop: (event) => {
        event.preventDefault();
        void commit(groupId, inGroup(groupId).length);
        reset();
      },
    }),
  };
}
