import { usePreviousApp } from "@/renderer/libs/hooks/use-previous-app";
import React, { useEffect, useState, useRef } from "react";
import ReactDOM from "react-dom";
import { iconCache } from "@/renderer/libs/utils/icon-cache";

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
  const { openedApps, isInitialized } = usePreviousApp();
  const [filteredApps, setFilteredApps] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const filteredAppsRef = useRef<string[]>([]);

  // Track previous searchQuery to know when it actually changes
  const prevSearchQueryRef = useRef(searchQuery);

  // Filter apps based on search query
  useEffect(() => {
    let newFilteredApps: string[];
    if (!searchQuery) {
      newFilteredApps = openedApps;
    } else {
      newFilteredApps = openedApps.filter((app) =>
        app.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }

    // Only reset index if search query changed (user typed something)
    const searchQueryChanged = prevSearchQueryRef.current !== searchQuery;
    prevSearchQueryRef.current = searchQuery;

    setFilteredApps(newFilteredApps);
    filteredAppsRef.current = newFilteredApps; // Keep ref updated

    // Only reset selectedIndex when search query changes, not when openedApps updates
    if (searchQueryChanged) {
      setSelectedIndex(0);
    }

    // Reset refs array to match new filtered list
    itemRefs.current = new Array(newFilteredApps.length).fill(null);
  }, [openedApps, searchQuery]);

  const handleSelect = (appName: string) => {
    onSelect(appName);
    onClose();
  };

  // Handle click outside to close dropdown
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Check if click is outside the dropdown
      if (!target.closest("[data-app-mention-dropdown]")) {
        onClose();
      }
    };

    // Add small delay to avoid immediately closing on open
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Handle keyboard navigation when dropdown is open
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return; // Double check

      const currentApps = filteredAppsRef.current; // Get latest apps from ref
      if (currentApps.length === 0) return; // Exit if no apps

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((prev) => {
            // Wrap around to first item when at the end
            const newIndex = prev < currentApps.length - 1 ? prev + 1 : 0;
            // Scroll to the new item
            setTimeout(() => {
              if (itemRefs.current[newIndex]) {
                itemRefs.current[newIndex]?.scrollIntoView({
                  behavior: "smooth",
                  block: "nearest",
                });
              }
            }, 0);
            return newIndex;
          });
          break;
        case "ArrowUp":
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((prev) => {
            // Wrap around to last item when at the beginning
            const newIndex = prev > 0 ? prev - 1 : currentApps.length - 1;
            // Scroll to the new item
            setTimeout(() => {
              if (itemRefs.current[newIndex]) {
                itemRefs.current[newIndex]?.scrollIntoView({
                  behavior: "smooth",
                  block: "nearest",
                });
              }
            }, 0);
            return newIndex;
          });
          break;
        case "Enter":
          e.preventDefault();
          e.stopPropagation();
          // Use callback to get current selected index
          setSelectedIndex((currentIndex) => {
            if (currentApps[currentIndex]) {
              handleSelect(currentApps[currentIndex]);
            }
            return currentIndex;
          });
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
  }, [isOpen, handleSelect, onClose]); // Remove filteredApps from deps to avoid closure issues

  if (!isOpen) return null;

  // Calculate adjusted position to prevent off-screen rendering
  const dropdownWidth = 256; // w-64 = 16rem = 256px
  const adjustedPosition = {
    x: Math.min(position?.x || 0, window.innerWidth - dropdownWidth - 10),
    y: position?.y || 0,
  };

  const dropdownContent = (
    <div
      data-app-mention-dropdown
      className="fixed z-[9999] w-64 bg-gray-100 border border-gray-300 rounded-lg shadow-lg overflow-hidden"
      style={{
        left: Math.max(10, adjustedPosition.x),
        top: adjustedPosition.y,
      }}
    >
      <div
        className="overflow-y-auto overflow-x-hidden"
        style={{
          maxHeight: `min(300px, calc(100vh - ${adjustedPosition.y + 10}px))`,
          minHeight:
            !isInitialized || filteredApps.length === 0 ? "80px" : "auto",
        }}
      >
        {!isInitialized ? (
          <div className="py-6 text-center text-sm text-gray-500">
            <div className="animate-pulse">Loading apps...</div>
          </div>
        ) : filteredApps.length === 0 ? (
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
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
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

  return ReactDOM.createPortal(dropdownContent, document.body);
}

interface AppMentionItemProps {
  appName: string;
  isSelected: boolean;
  onSelect: () => void;
  onMouseEnter: () => void;
}

const AppMentionItem = React.forwardRef<HTMLDivElement, AppMentionItemProps>(
  ({ appName, isSelected, onSelect, onMouseEnter }, ref) => {
    const [iconPath, setIconPath] = useState<string | null>(() => {
      // Check cache first on mount
      if (iconCache.has(appName)) {
        const cached = iconCache.get(appName);
        return cached !== undefined ? cached : null;
      }
      return null;
    });
    const [isLoadingIcon, setIsLoadingIcon] = useState(() => {
      // Show loading if we don't have cached icon
      return !iconCache.has(appName);
    });

    // Load app icon when component mounts or appName changes
    useEffect(() => {
      // If already cached, use cached value
      if (iconCache.has(appName)) {
        const cached = iconCache.get(appName);
        setIconPath(cached !== undefined ? cached : null);
        setIsLoadingIcon(false);
        return;
      }

      // Start loading for new app
      const loadIcon = async () => {
        if (!window.activeAppAPI) return;

        setIsLoadingIcon(true);
        try {
          const icon = await window.activeAppAPI.getAppIcon(appName);
          setIconPath(icon);
          iconCache.set(appName, icon); // Cache the result
        } catch (error) {
          console.error(`Failed to load icon for ${appName}:`, error);
          setIconPath(null);
          iconCache.set(appName, null); // Cache failure too
        } finally {
          setIsLoadingIcon(false);
        }
      };

      loadIcon();
    }, [appName]);

    return (
      <div
        ref={ref}
        onClick={onSelect}
        onMouseEnter={onMouseEnter}
        className={`flex items-center gap-2 cursor-pointer px-2 py-1.5 text-sm rounded-sm transition-colors ${
          isSelected ? "bg-gray-200" : "hover:bg-gray-200"
        }`}
      >
        <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
          {isLoadingIcon ? (
            <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" />
          ) : iconPath ? (
            <img
              src={
                iconPath.startsWith("data:") ? iconPath : `file://${iconPath}`
              }
              alt={`${appName} icon`}
              className="w-4 h-4 rounded-sm object-cover"
              onError={() => {
                // Fallback to green dot if icon fails to load and update cache
                setIconPath(null);
                iconCache.set(appName, null);
              }}
              loading="lazy"
            />
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-green-500/80" />
          )}
        </div>
        <span className="text-gray-900">{appName}</span>
      </div>
    );
  },
);

AppMentionItem.displayName = "AppMentionItem";
