import { cn } from "@/renderer/libs/utils/tailwind";
import React from "react";

interface EnhancedDragRegionProps extends React.HTMLAttributes<HTMLDivElement> {
  position?: "top" | "bottom" | "left" | "right" | "all";
  size?: number;
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
  className?: string;
  disabled?: boolean;
}

/**
 * Enhanced drag region component that supports multiple positions
 * This creates draggable areas at different positions of the window
 */
export function EnhancedDragRegion({
  position = "all",
  size = 8,
  top,
  bottom,
  left,
  right,
  className,
  disabled = false,
  ...props
}: EnhancedDragRegionProps) {
  if (disabled) {
    return null;
  }
  if (
    top !== undefined ||
    bottom !== undefined ||
    left !== undefined ||
    right !== undefined
  ) {
    const regions: React.ReactNode[] = [];
    if (top !== undefined)
      regions.push(<EnhancedDragRegion key="t" position="top" size={top} />);
    if (bottom !== undefined)
      regions.push(
        <EnhancedDragRegion key="b" position="bottom" size={bottom} />,
      );
    if (left !== undefined)
      regions.push(<EnhancedDragRegion key="l" position="left" size={left} />);
    if (right !== undefined)
      regions.push(
        <EnhancedDragRegion key="r" position="right" size={right} />,
      );
    return <>{regions}</>;
  }
  const getPositionClasses = () => {
    switch (position) {
      case "top":
        return "top-0 left-0 right-0";
      case "bottom":
        return "bottom-0 left-0 right-0";
      case "left":
        return "top-0 left-0 bottom-0";
      case "right":
        return "top-0 right-0 bottom-0";
      case "all":
        return "inset-0";
      default:
        return "inset-0";
    }
  };

  const getSizeStyles = () => {
    switch (position) {
      case "top":
      case "bottom":
        return { height: `${size}px` };
      case "left":
      case "right":
        return { width: `${size}px` };
      case "all":
        return {};
      default:
        return {};
    }
  };

  return (
    <div
      className={cn(
        "draglayer absolute z-10 bg-transparent pointer-events-none",
        getPositionClasses(),
        className,
      )}
      style={getSizeStyles()}
      {...props}
    />
  );
}

/**
 * Sidebar drag region component for whitespace areas
 * This creates draggable areas in sidebar whitespace
 * Uses a special CSS class that allows selective dragging
 */
export function SidebarDragRegion({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("sidebar-drag-region relative", className)} {...props}>
      {children}
    </div>
  );
}


