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
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout>();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Filter apps based on search query
  useEffect(() => {
    if (!searchQuery) {
      setFilteredApps(openedApps);
    } else {
      const filtered = openedApps.filter((app) =>
        app.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredApps(filtered);
    }
    setSelectedIndex(0); // Reset selection when apps change
  }, [openedApps, searchQuery]);

  // Auto-scroll to selected item when using keyboard navigation
  useEffect(() => {
    if (!scrollContainerRef.current || filteredApps.length === 0) return;

    const container = scrollContainerRef.current;
    const selectedElement = container.children[selectedIndex] as HTMLElement;
    
    if (selectedElement) {
      selectedElement.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [selectedIndex, filteredApps.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle specific keys when dropdown is open
      if (!['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) {
        return;
      }
      
      console.log('AppMentionDropdown handling key:', e.key, 'isOpen:', isOpen);
      
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex(prev => Math.min(prev + 1, filteredApps.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          e.stopPropagation();
          if (filteredApps[selectedIndex]) {
            handleSelect(filteredApps[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          e.stopPropagation(); // Prevent event from bubbling up
          onClose();
          break;
      }
    };

    // Use capture phase to ensure we handle the event before React's synthetic events
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, filteredApps, selectedIndex, onClose]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  const handleSelect = (appName: string) => {
    onSelect(appName);
    onClose();
  };

  const handleScroll = () => {
    setIsScrolling(true);
    
    // Clear existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    // Set timeout to hide scrollbar after scrolling stops
    scrollTimeoutRef.current = setTimeout(() => {
      setIsScrolling(false);
    }, 1000); // Hide after 1 second of no scrolling
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed z-50 w-64 bg-background border border-border rounded-lg shadow-lg"
      style={{
        left: position?.x || 0,
        top: position?.y || 0,
      }}
    >
      <div className="p-2">
        {filteredApps.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4">No apps found</div>
        ) : (
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2 px-2">Open Apps</div>
            <div 
              ref={scrollContainerRef}
              className={`max-h-64 overflow-y-auto scrollbar-thin scrollbar-track-transparent transition-all duration-200 space-y-1 ${
                isScrolling 
                  ? 'scrollbar-thumb-accent/40' 
                  : 'scrollbar-thumb-transparent hover:scrollbar-thumb-accent/20'
              }`}
              style={{ 
                overscrollBehavior: 'contain',
                WebkitOverflowScrolling: 'touch'
              }}
              onScroll={handleScroll}
            >
              {filteredApps.map((app, index) => (
                <AppMentionItem
                  key={app}
                  appName={app}
                  isSelected={index === selectedIndex}
                  onSelect={() => handleSelect(app)}
                />
              ))}
            </div>
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
}

function AppMentionItem({ appName, isSelected, onSelect }: AppMentionItemProps) {
  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-2 cursor-pointer px-2 py-1.5 text-sm rounded-md transition-colors ${
        isSelected 
          ? 'bg-accent text-accent-foreground' 
          : 'text-foreground'
      } ${!isSelected ? 'hover:bg-accent/30' : ''}`}
    >
      <div className="w-1.5 h-1.5 rounded-full bg-green-500/80" />
      <span>{appName}</span>
    </div>
  );
}