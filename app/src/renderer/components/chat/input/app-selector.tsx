import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/renderer/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/renderer/components/ui/popover";
import { cn } from "@/renderer/libs/utils/tailwind";
import { Monitor } from "lucide-react";
import React, { useEffect, useState } from "react";

interface AppSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (appName: string) => void;
  children: React.ReactNode;
}

export function AppSelector({
  open,
  onOpenChange,
  onSelect,
  children,
}: AppSelectorProps) {
  const [apps, setApps] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setIsLoading(true);
      window.activeAppAPI
        .getOpenedApps()
        .then((appList) => {
          setApps(appList || []);
        })
        .catch((error) => {
          console.error("Failed to get opened apps:", error);
          setApps([]);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80 p-0 z-50" align="start" sideOffset={5}>
        <Command>
          <CommandInput placeholder="Search opened apps..." />
          <CommandList>
            <CommandEmpty>
              {isLoading ? "Loading apps..." : "No apps found."}
            </CommandEmpty>
            {apps.length > 0 && (
              <CommandGroup heading="Opened Applications">
                {apps.map((app) => (
                  <CommandItem
                    key={app}
                    value={app}
                    onSelect={() => {
                      onSelect(app);
                      onOpenChange(false);
                    }}
                    className={cn(
                      "flex items-center gap-2 cursor-pointer",
                      "hover:bg-accent/50",
                    )}
                  >
                    <Monitor size={16} className="text-muted-foreground" />
                    <span>{app}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
