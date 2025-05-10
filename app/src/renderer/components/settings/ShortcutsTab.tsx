import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Button } from "../ui/button";
import { Loader2, RotateCcw } from "lucide-react";
import { AppSettings } from "@/shared/types/settings";

type ShortcutsTabProps = {
  settings: AppSettings;
  activeShortcut: string | null;
  recordingShortcut: string;
  shortcutInputRef: React.RefObject<HTMLButtonElement>;
  onStartRecording: (id: string) => void;
  onResetShortcuts: () => void;
};

export function ShortcutsTab({
  settings,
  activeShortcut,
  recordingShortcut,
  shortcutInputRef,
  onStartRecording,
  onResetShortcuts,
}: ShortcutsTabProps) {
  return (
    <Card className="bg-card text-foreground border-none">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Keyboard Shortcuts</CardTitle>
          <CardDescription className="text-muted-foreground">
            Manage application shortcuts
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onResetShortcuts}
          className="border-border text-foreground hover:bg-secondary hover:text-foreground"
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {settings.shortcuts
            .filter((s) => ["activate", "open_settings"].includes(s.id))
            .map((shortcut) => (
              <div
                key={shortcut.id}
                className="bg-secondary flex items-center justify-between rounded border-none p-2"
              >
                <p className="text-foreground flex-1 font-medium">
                  {shortcut.name}
                </p>
                <button
                  ref={activeShortcut === shortcut.id ? shortcutInputRef : undefined}
                  onClick={() => onStartRecording(shortcut.id)}
                  className="bg-secondary text-foreground hover:bg-secondary/80 ml-4 rounded px-2 py-1 text-xs focus:outline-none"
                  style={{ minWidth: "100px" }}
                >
                  {activeShortcut === shortcut.id ? (
                    <span className="flex items-center justify-center">
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      {recordingShortcut || "Press keys..."}
                    </span>
                  ) : (
                    <kbd>{shortcut.shortcut}</kbd>
                  )}
                </button>
              </div>
            ))}
        </div>
      </CardContent>
    </Card>
  );
} 