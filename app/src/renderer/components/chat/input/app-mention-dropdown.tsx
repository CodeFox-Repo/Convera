import { usePreviousApp } from "@/renderer/libs/hooks/use-previous-app";
import React, { useEffect, useState, useRef } from "react";

interface AppMentionDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (appName: string) => void;
  searchQuery: string;
  position?: { x: number; y: number };
}

export function AppMentionDropdown({
  isOpen,
  onClose,
  onSelect,
  searchQuery,
  position,
}: AppMentionDropdownProps) {
  const { openedApps } = usePreviousApp();
  const [filteredApps, setFilteredApps] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Filter apps based on search query
  useEffect(() => {
    if (!searchQuery) {
      setFilteredApps(openedApps);
    } else {
      const filtered = openedApps.filter((app) =>
        app.toLowerCase().includes(searchQuery.toLowerCase()),
      );
      setFilteredApps(filtered);
    }
    setSelectedIndex(0); // Reset selection when filtering
    // Reset refs array
    itemRefs.current = [];
  }, [openedApps, searchQuery]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [selectedIndex]);

  // Handle keyboard navigation when dropdown is open
  useEffect(() => {
    if (!isOpen || filteredApps.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return; // Double check

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((prev) =>
            prev < filteredApps.length - 1 ? prev + 1 : prev,
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          break;
        case "Enter":
          e.preventDefault();
          e.stopPropagation();
          if (filteredApps[selectedIndex]) {
            handleSelect(filteredApps[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          e.stopPropagation();
          onClose();
          break;
      }
    };

    // Use capture phase to intercept events before they reach the main chat component
    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [isOpen, filteredApps, selectedIndex]);

  const handleSelect = (appName: string) => {
    onSelect(appName);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed z-50 w-64 bg-gray-100 border border-gray-300 rounded-lg shadow-lg overflow-hidden"
      style={{
        left: position?.x || 0,
        top: position?.y || 0,
      }}
    >
      <div className="max-h-[300px] overflow-y-auto">
        {filteredApps.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-500">
            No apps found
          </div>
        ) : (
          <div className="p-1">
            <div className="px-2 py-1.5 text-xs font-medium text-gray-600">
              Open Apps
            </div>
            {filteredApps.map((app, index) => (
              <AppMentionItem
                key={app}
                ref={(el) => (itemRefs.current[index] = el)}
                appName={app}
                isSelected={index === selectedIndex}
                onSelect={() => handleSelect(app)}
                onMouseEnter={() => setSelectedIndex(index)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface AppMentionItemProps {
  appName: string;
  isSelected: boolean;
  onSelect: () => void;
  onMouseEnter: () => void;
}

const AppMentionItem = React.forwardRef<HTMLDivElement, AppMentionItemProps>(
  ({ appName, isSelected, onSelect, onMouseEnter }, ref) => {
    return (
      <div
        ref={ref}
        onClick={onSelect}
        onMouseEnter={onMouseEnter}
        className={`flex items-center gap-2 cursor-pointer px-2 py-1.5 text-sm rounded-sm transition-colors ${
          isSelected ? "bg-gray-200" : "hover:bg-gray-200"
        }`}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-green-500/80" />
        <span>{appName}</span>
      </div>
    );
  },
);

AppMentionItem.displayName = "AppMentionItem";