import { AppSettings } from "@/shared/types/settings";
import { RotateCcw } from "lucide-react";
import React from "react";
import { Button } from "../ui/button";

type ShortcutsSectionProps = {
  settings: AppSettings;
  activeShortcut: string | null;
  recordingShortcut: string;
  shortcutInputRef: React.RefObject<HTMLButtonElement>;
  onStartRecording: (id: string) => void;
  onResetShortcuts: () => void;
};

export function ShortcutsSection({
  settings,
  activeShortcut,
  recordingShortcut,
  shortcutInputRef,
  onStartRecording,
  onResetShortcuts,
}: ShortcutsSectionProps) {
  return (
    <div className="space-y-6">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-medium text-foreground">
              Keyboard Shortcuts
            </h2>
            <p className="text-muted-foreground mt-1">
              Manage application shortcuts
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onResetShortcuts}
            className="border-border flex items-center gap-1 text-foreground hover:bg-secondary hover:text-foreground"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
        </div>
      </div>

      <div className="flex flex-col space-y-4">
        {settings.shortcuts
          .filter((s) => ["activate", "open_settings"].includes(s.id))
          .map((shortcut) => (
            <div
              key={shortcut.id}
              className={`border-l-4 ${activeShortcut === shortcut.id ? "border-l-orange-500" : "border-l-primary"} border-b border-border pb-4 last:border-0 hover:bg-secondary/10 transition-all duration-200 pl-3 group relative`}
            >
              <div className="flex items-center justify-between py-2">
                <p className="text-foreground font-semibold">{shortcut.name}</p>
                <button
                  ref={
                    activeShortcut === shortcut.id
                      ? shortcutInputRef
                      : undefined
                  }
                  onClick={() => onStartRecording(shortcut.id)}
                  className={`${activeShortcut === shortcut.id ? "bg-orange-500/20 text-foreground" : "bg-secondary/40 text-muted-foreground hover:bg-secondary/60"} rounded px-3 py-1.5 text-sm font-medium focus:outline-none transition-all`}
                  style={{ minWidth: "120px", textAlign: "center" }}
                >
                  {activeShortcut === shortcut.id ? (
                    <span className="flex items-center justify-center">
                      {recordingShortcut || "Press keys..."}
                    </span>
                  ) : (
                    <kbd className="font-mono">{shortcut.shortcut}</kbd>
                  )}
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
