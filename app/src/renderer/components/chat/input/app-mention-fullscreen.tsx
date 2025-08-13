import React, { useEffect, useState, useRef } from "react";
import { useAppIcon } from "@/renderer/libs/hooks/use-app-icon";
import { usePreviousApp } from "@/renderer/libs/hooks/use-previous-app";

interface AppMentionFullscreenProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (appName: string) => void;
  searchQuery: string;
}

export function AppMentionFullscreen({
  isOpen,
  onClose,
  onSelect,
  searchQuery,
}: AppMentionFullscreenProps) {
  const { openedApps } = usePreviousApp();
  const [filteredApps, setFilteredApps] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // console.log("📱 AppMentionFullscreen: filteredApps count:", filteredApps.length);

  // Filter apps based on search query (after @)
  useEffect(() => {
    // Remove duplicates first and filter out unwanted apps
    const uniqueApps = [...new Set(openedApps)].filter((app) => {
      // Filter out system processes and unwanted apps
      const unwantedApps = [
        "osascript",
        "System Events",
        "loginwindow",
        "WindowServer",
        "Dock",
        "Finder Helper",
        "SystemUIServer",
        "ControlCenter",
        "Spotlight",
      ];
      return !unwantedApps.includes(app);
    });

    console.log(
      `🔍 AppMentionFullscreen: openedApps count: ${openedApps.length}`,
      openedApps.slice(0, 5),
    );
    console.log(
      `🔍 AppMentionFullscreen: uniqueApps count: ${uniqueApps.length}`,
      uniqueApps.slice(0, 5),
    );

    let filteredApps: string[];
    if (!searchQuery) {
      filteredApps = uniqueApps;
    } else {
      const query = searchQuery.toLowerCase();

      // Smart search: match apps that:
      // 1. Start with the query (highest priority)
      // 2. Contains the query as a word
      // 3. Contains the query anywhere
      const startsWithQuery = uniqueApps.filter((app) =>
        app.toLowerCase().startsWith(query),
      );

      const containsAsWord = uniqueApps.filter((app) => {
        const appLower = app.toLowerCase();
        // Check if query matches any word in the app name
        const words = appLower.split(/[\s-]+/);
        return (
          !appLower.startsWith(query) &&
          words.some((word) => word.startsWith(query))
        );
      });

      const containsAnywhere = uniqueApps.filter((app) => {
        const appLower = app.toLowerCase();
        return (
          !appLower.startsWith(query) &&
          !appLower.split(/[\s-]+/).some((word) => word.startsWith(query)) &&
          appLower.includes(query)
        );
      });

      // Combine results in priority order, removing duplicates
      filteredApps = [
        ...startsWithQuery,
        ...containsAsWord,
        ...containsAnywhere,
      ];
    }

    // Don't show anything if we have no apps yet (still loading)
    // This prevents the Finder fallback from appearing briefly

    setFilteredApps(filteredApps);
    setSelectedIndex(0);
  }, [openedApps, searchQuery]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen || filteredApps.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
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
        case "Tab":
        case "Enter":
          e.preventDefault();
          e.stopPropagation();
          if (filteredApps[selectedIndex]) {
            onSelect(filteredApps[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown, { capture: true });

    return () => {
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [isOpen, filteredApps, selectedIndex, onSelect, onClose]);

  // Handle mouse wheel on scroll container
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !isOpen || filteredApps.length === 0) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY > 0) {
        // Scroll down - move to next item (stop at last item, don't wrap)
        setSelectedIndex((prev) =>
          prev < filteredApps.length - 1 ? prev + 1 : prev,
        );
      } else {
        // Scroll up - move to previous item (stop at first item, don't wrap)
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, [isOpen, filteredApps, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    if (itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div className="flex-1 overflow-hidden">
      {/* App list section - full height, scrollable */}
      <div
        ref={scrollContainerRef}
        className="h-full overflow-y-auto px-1 py-2"
      >
        {filteredApps.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-sm text-gray-500">No matching apps</div>
          </div>
        ) : (
          <div className="space-y-3 min-h-full">
            {filteredApps.map((app, index) => (
              <AppMentionItem
                key={app}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                appName={app}
                isSelected={index === selectedIndex}
                onSelect={() => {
                  onSelect(app);
                }}
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
    const { iconData: appIcon, isLoading: iconLoading } = useAppIcon(appName);

    return (
      <div
        ref={ref}
        onClick={onSelect}
        onMouseEnter={onMouseEnter}
        className={`flex items-center gap-3 cursor-pointer pl-0 pr-3 py-3 rounded-lg transition-all duration-200 ease-in-out border border-transparent ${
          isSelected
            ? "bg-gray-100/60 dark:bg-gray-800/40 border-gray-200/50 dark:border-gray-700/50 shadow-sm"
            : "hover:bg-gray-50/60 dark:hover:bg-gray-900/40 hover:border-gray-100/50 dark:hover:border-gray-800/50 hover:shadow-sm"
        }`}
      >
        <div className={`w-6 h-6 flex items-center justify-center flex-shrink-0 transition-transform duration-200 ${
          isSelected ? "scale-110" : ""
        }`}>
          {iconLoading ? (
            <div className="w-5 h-5 rounded bg-gray-200 animate-pulse" />
          ) : appIcon ? (
            <img
              src={appIcon}
              alt={`${appName} icon`}
              className={`w-6 h-6 rounded object-cover transition-all duration-200 ${
                isSelected ? "shadow-md" : ""
              }`}
              style={{
                imageRendering: "auto",
                filter: isSelected ? "contrast(1.1) brightness(1.05)" : "contrast(1.05)",
              }}
            />
          ) : (
            <div className={`w-6 h-6 rounded bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center transition-all duration-200 ${
              isSelected ? "from-blue-200 to-blue-300 shadow-md" : ""
            }`}>
              <span className={`text-xs font-semibold transition-colors duration-200 ${
                isSelected ? "text-blue-700" : "text-gray-600"
              }`}>
                {appName.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>
        <span className="text-base font-medium text-gray-900 dark:text-gray-100 flex-1">
          {appName}
        </span>
      </div>
    );
  },
);

AppMentionItem.displayName = "AppMentionItem";
