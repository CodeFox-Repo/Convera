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
import React, { useEffect, useState } from "react";

interface AppSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (appName: string) => void;
  children: React.ReactNode;
}

interface AppInfo {
  name: string;
  iconUrl?: string;
}

export function AppSelector({
  open,
  onOpenChange,
  onSelect,
  children,
}: AppSelectorProps) {
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setIsLoading(true);
      window.activeAppAPI
        .getOpenedApps()
        .then(async (appList) => {
          // Get icons for each app using new getProcessIcon system
          const appInfos = await Promise.all(
            (appList || []).map(async (name) => {
              try {
                const result = await window.electronAPI.getProcessIcon(0, name);
                return {
                  name,
                  iconUrl: result.success ? result.iconData : undefined
                };
              } catch (error) {
                console.error(`Failed to get icon for ${name}:`, error);
                return {
                  name,
                  iconUrl: undefined
                };
              }
            })
          );
          setApps(appInfos);
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
      <PopoverContent className="w-80 p-0 z-50 border-0 shadow-2xl bg-gradient-to-br from-background/95 to-background/90 backdrop-blur-xl rounded-2xl ring-1 ring-white/10 overflow-hidden" align="start" sideOffset={5}>
        <Command className="bg-transparent">
          <CommandInput placeholder="Search opened apps..." className="border-0 bg-transparent" />
          <CommandList>
            <CommandEmpty>
              {isLoading ? "Loading apps..." : "No apps found."}
            </CommandEmpty>
            {apps.length > 0 && (
              <CommandGroup>
                {apps.map((app) => (
                  <CommandItem
                    key={app.name}
                    value={app.name}
                    onSelect={() => {
                      onSelect(app.name);
                      onOpenChange(false);
                    }}
                    className={cn(
                      "flex items-center gap-3 cursor-pointer rounded-xl px-3 py-2.5 mx-2",
                      "hover:bg-gradient-to-r hover:from-primary/5 hover:to-primary/10 hover:shadow-md transition-all duration-200",
                      "data-[selected=true]:bg-gradient-to-r data-[selected=true]:from-primary/10 data-[selected=true]:to-primary/20",
                    )}
                  >
                    {/* App icon or fallback */}
                    {app.iconUrl ? (
                      <img 
                        src={app.iconUrl} 
                        alt={`${app.name} icon`}
                        className="w-7 h-7 rounded-lg object-cover shadow-sm"
                        onError={(e) => {
                          // If icon fails to load, show fallback
                          e.currentTarget.style.display = 'none';
                          const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div 
                      className={`w-7 h-7 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-xs font-semibold text-primary shadow-sm border border-primary/10 ${app.iconUrl ? 'hidden' : ''}`}
                    >
                      {app.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium text-sm text-foreground/90">{app.name}</span>
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
