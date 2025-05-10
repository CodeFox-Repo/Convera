import React from "react";
import { cn } from "@/renderer/utils/tailwind";

interface DragLayerProps extends React.HTMLAttributes<HTMLDivElement> {
  height?: number;
}

/**
 * Draggable area component for frameless windows
 * This creates an area where users can drag to move the window
 */
export function DragLayer({
  className,
  height = 24,
  ...props
}: DragLayerProps) {
  return (
    <div
      className={cn(
        "draglayer absolute top-0 right-0 left-0 z-50 bg-transparent",
        className,
      )}
      style={{ height: `${height}px` }}
      {...props}
    />
  );
}
