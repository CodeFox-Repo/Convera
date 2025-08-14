import React, { useEffect, useState, useRef, useCallback } from "react";
import { useAppIcon } from "@/renderer/libs/hooks/use-app-icon";
import { usePreviousApp } from "@/renderer/libs/hooks/use-previous-app";
import { FILTERED_APPS } from "@/renderer/assets/builtin-app-icons";

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
  const [isLoading, setIsLoading] = useState(() => openedApps.length === 0);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Filter apps based on search query (after @)
  useEffect(() => {
    // Remove duplicates first and filter out unwanted apps
    const uniqueApps = [...new Set(openedApps)].filter((app) => {
      // Filter out system processes and unwanted apps
      return !FILTERED_APPS.includes(app);
    });

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

    setFilteredApps(filteredApps);
    setSelectedIndex(0);

    // Set loading to false once we have processed the apps
    if (openedApps.length > 0) {
      setIsLoading(false);
    }
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

  // Handle mouse wheel with throttling for smooth scrolling
  const throttledWheelHandler = useCallback(
    (e: WheelEvent) => {
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
    },
    [filteredApps.length],
  );

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !isOpen || filteredApps.length === 0) return;

    container.addEventListener("wheel", throttledWheelHandler, {
      passive: false,
    });

    return () => {
      container.removeEventListener("wheel", throttledWheelHandler);
    };
  }, [isOpen, filteredApps.length, throttledWheelHandler]);

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
    <div className="flex-1 w-full animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="rounded-lg border border-foreground/10 backdrop-blur-sm bg-white/5 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="px-4 py-4">
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-0 py-2 animate-in fade-in duration-300"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className="w-4 h-4 rounded bg-foreground/10 animate-pulse" />
                  <div className="flex-1">
                    <div className="h-3 bg-foreground/10 rounded animate-pulse mb-1" />
                    <div className="h-2 bg-foreground/5 rounded animate-pulse w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : filteredApps.length === 0 ? (
          <div className="px-4 py-8 text-center text-foreground/60">
            <div className="text-sm">No matching apps</div>
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto" ref={scrollContainerRef}>
            {filteredApps.map((app, index) => (
              <div
                key={app}
                className="animate-in fade-in duration-150"
                style={{ animationDelay: `${index * 20}ms` }}
              >
                <AppMentionItem
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
              </div>
            ))}
          </div>
        )}

        {/* Bottom action bar - matching Google Translate style */}
        <div className="border-t border-foreground/10 px-4 py-3">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1 text-foreground/60">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded border border-foreground/20 text-[10px] font-medium">
                  ⏎
                </span>
                <span>Select App</span>
              </div>
              <div className="flex items-center gap-1 text-foreground/60">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded border border-foreground/20 text-[10px] font-medium">
                  ⌫
                </span>
                <span>Cancel</span>
              </div>
            </div>
            <div className="text-foreground/40 text-right">App Mention</div>
          </div>
        </div>
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
        className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all duration-200 ease-in-out ${
          isSelected
            ? "bg-foreground/8 scale-[1.02]"
            : "hover:bg-foreground/8 active:bg-foreground/12 hover:scale-[1.01]"
        }`}
      >
        <div className="text-lg flex items-center justify-center">
          {iconLoading ? (
            <div className="w-4 h-4 rounded bg-foreground/20 animate-pulse" />
          ) : appIcon ? (
            <img
              src={appIcon}
              alt={`${appName} icon`}
              className="w-4 h-4 rounded object-cover"
              style={{
                imageRendering: "auto",
              }}
            />
          ) : (
            <div className="w-4 h-4 rounded bg-gradient-to-br from-foreground/20 to-foreground/30 flex items-center justify-center">
              <span className="text-[10px] font-semibold text-foreground/70">
                {appName.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-foreground text-sm">{appName}</div>
          <div className="text-xs text-foreground/60">
            Add @{appName} to message
          </div>
        </div>
        <div className="text-xs text-foreground/40 flex items-center justify-center">
          ⏎
        </div>
      </div>
    );
  },
);

AppMentionItem.displayName = "AppMentionItem";
