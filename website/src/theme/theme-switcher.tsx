import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Check, Palette } from "lucide-react";
import { useTheme, type ThemeColor } from "./theme-provider";

const colorOptions: { value: ThemeColor; label: string; preview: string }[] = [
  { value: "orange", label: "Orange", preview: "bg-orange-500" },
  { value: "pink", label: "Pink", preview: "bg-pink-500" },
];

interface ThemeSwitcherProps {
  className?: string;
  variant?: "button" | "compact";
}

export function ThemeSwitcher({ className, variant = "button" }: ThemeSwitcherProps) {
  const { config, setColor } = useTheme();

  if (variant === "compact") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className={cn("h-9 w-9", className)}>
            <Palette className="h-4 w-4" />
            <span className="sr-only">Theme settings</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Theme Settings</DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
            Color Scheme
          </DropdownMenuLabel>
          {colorOptions.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => setColor(option.value)}
              className="flex cursor-pointer items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <div className={cn("h-3 w-3 rounded-full", option.preview)} />
                <span>{option.label}</span>
              </div>
              {config.color === option.value && <Check className="h-4 w-4" />}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div>
        <h3 className="mb-3 text-lg font-semibold">Color Theme</h3>
        <div className="grid grid-cols-5 gap-2">
          {colorOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setColor(option.value)}
              className={cn(
                "group relative flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-all duration-200",
                config.color === option.value
                  ? "border-brand-500 bg-brand-50 dark:bg-brand-950"
                  : "border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600",
              )}
            >
              <div className={cn("h-6 w-6 rounded-full", option.preview)} />
              <span className="text-xs font-medium">{option.label}</span>
              {config.color === option.value && (
                <div className="bg-brand-500 absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full">
                  <Check className="h-2.5 w-2.5 text-white" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
