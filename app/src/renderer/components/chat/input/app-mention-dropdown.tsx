import { useAppIcon } from "@/renderer/libs/hooks/use-app-icon";
import { usePreviousApp } from "@/renderer/libs/hooks/use-previous-app";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/renderer/components/ui/command";
import React, { useEffect, useState } from "react";

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

  // Debug logging
  console.log("🎯 AppMentionDropdown - isOpen:", isOpen, "openedApps:", openedApps, "searchQuery:", searchQuery);

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
  }, [openedApps, searchQuery]);

  const handleSelect = (appName: string) => {
    onSelect(appName);
    onClose();
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
      <Command>
        <CommandList>
          {filteredApps.length === 0 ? (
            <CommandEmpty>No apps found</CommandEmpty>
          ) : (
            <CommandGroup heading="Open Apps">
              {filteredApps.map((app) => (
                <AppMentionItem
                  key={app}
                  appName={app}
                  onSelect={() => handleSelect(app)}
                />
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </div>
  );
}

interface AppMentionItemProps {
  appName: string;
  onSelect: () => void;
}

function AppMentionItem({ appName, onSelect }: AppMentionItemProps) {
  const appIcon = useAppIcon(appName);

  return (
    <CommandItem onSelect={onSelect} className="flex items-center gap-2 cursor-pointer">
      {appIcon ? (
        <img
          src={`file://${appIcon}`}
          alt={appName}
          className="w-4 h-4 rounded"
          onError={(e) => {
            console.log(`❌ Failed to load icon for ${appName}:`, appIcon);
            // Hide the img element and show fallback
            e.currentTarget.style.display = 'none';
          }}
        />
      ) : null}
      {!appIcon && (
        <div className="w-4 h-4 bg-muted rounded flex items-center justify-center text-xs">
          {appName.charAt(0).toUpperCase()}
        </div>
      )}
      <span className="text-sm">{appName}</span>
    </CommandItem>
  );
}