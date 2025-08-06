import { AccountSection } from "@/renderer/components/account/account-section";
import { Button } from "@/renderer/components/ui/button";
import { usePreviousApp } from "@/renderer/libs/hooks/use-previous-app";
import { useSettingsStore } from "@/renderer/libs/stores/settings-store";
import { Loader2, Monitor, RotateCcw } from "lucide-react";
import React, { useCallback, useEffect, useRef } from "react";

export function GeneralSettingsPage() {
  // Refs for shortcut recording
  const shortcutInputRef = useRef<HTMLButtonElement>(null);
  const recordingStateRef = useRef<string>("");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Previous App Hook
  const { previousApp, previousAppContentRef, formatAppName } =
    usePreviousApp();

  // Settings Store
  const {
    settings,
    settingsLoading,
    activeShortcut,
    recordingShortcut,
    initializeSettings,
    handleResetShortcuts,
    setActiveShortcut,
    setRecordingShortcut,
    saveRecordedShortcut,
    subscribeToSettingsChanges,
  } = useSettingsStore();

  // Initialize stores on component mount
  useEffect(() => {
    initializeSettings();
    const unsubscribeSettings = subscribeToSettingsChanges();
    return () => {
      unsubscribeSettings();
    };
  }, [initializeSettings, subscribeToSettingsChanges]);

  // Shortcut recording functions
  const saveRecordedShortcutCallback = useCallback(
    async (shortcutToSave: string) => {
      await saveRecordedShortcut(shortcutToSave);
      recordingStateRef.current = "";

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    },
    [saveRecordedShortcut],
  );

  const formatShortcut = (event: KeyboardEvent): string => {
    const parts: string[] = [];
    if (event.metaKey) parts.push("Command");
    if (event.ctrlKey) parts.push("Control");
    if (event.altKey) parts.push("Alt");
    if (event.shiftKey) parts.push("Shift");

    let key = "";

    if (event.key === " " || event.code === "Space") {
      key = "Space";
    } else if (event.code.startsWith("Key")) {
      key = event.code.replace("Key", "");
    } else if (event.key === "Dead") {
      key = "";
    } else if (event.code.startsWith("Digit")) {
      key = event.code.replace("Digit", "");
    } else if (event.code.startsWith("Numpad")) {
      key = event.code;
    } else if (event.code.startsWith("F") && /^F\d+$/.test(event.code)) {
      key = event.code;
    } else if (event.code.startsWith("Arrow")) {
      key = event.code.replace("Arrow", "") + "Arrow";
    } else if (
      !["Control", "Alt", "Shift", "Meta", "Command"].includes(event.key)
    ) {
      key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
    }

    if (
      key &&
      !["CONTROL", "ALT", "SHIFT", "META", "COMMAND"].includes(
        key.toUpperCase(),
      )
    ) {
      parts.push(key);
    }

    return parts.join("+");
  };

  const handleRecordingKeyEvent = useCallback(
    (event: KeyboardEvent) => {
      if (!activeShortcut) return;

      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setActiveShortcut(null);
        recordingStateRef.current = "";
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
        return;
      }

      if (event.type === "keydown") {
        const shortcutKeys = formatShortcut(event);
        setRecordingShortcut(shortcutKeys);

        const hasNonModifierKey =
          shortcutKeys &&
          !["Command", "Control", "Alt", "Shift"].includes(shortcutKeys) &&
          shortcutKeys
            .split("+")
            .some(
              (part) => !["Command", "Control", "Alt", "Shift"].includes(part),
            );

        if (hasNonModifierKey) {
          recordingStateRef.current = shortcutKeys;
          setRecordingShortcut(`${shortcutKeys} (release to save)`);

          if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
          }

          saveTimeoutRef.current = setTimeout(() => {
            saveRecordedShortcutCallback(shortcutKeys);
          }, 1000);
        }
      } else if (event.type === "keyup") {
        const isNonModifierKey = !["Meta", "Control", "Alt", "Shift"].includes(
          event.key,
        );

        if (isNonModifierKey && recordingStateRef.current) {
          saveRecordedShortcutCallback(recordingStateRef.current);
        }
      }
    },
    [
      activeShortcut,
      saveRecordedShortcutCallback,
      setRecordingShortcut,
      setActiveShortcut,
    ],
  );

  const startRecording = (id: string) => {
    setActiveShortcut(id);
  };

  // Effect for keyboard event handling during shortcut recording
  useEffect(() => {
    if (activeShortcut) {
      window.addEventListener("keydown", handleRecordingKeyEvent, true);
      window.addEventListener("keyup", handleRecordingKeyEvent, true);

      setTimeout(() => {
        shortcutInputRef.current?.focus();
      }, 0);
    } else {
      window.removeEventListener("keydown", handleRecordingKeyEvent, true);
      window.removeEventListener("keyup", handleRecordingKeyEvent, true);

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    }

    return () => {
      window.removeEventListener("keydown", handleRecordingKeyEvent, true);
      window.removeEventListener("keyup", handleRecordingKeyEvent, true);
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [activeShortcut, handleRecordingKeyEvent]);

  // Effect for click outside handling during shortcut recording
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        activeShortcut &&
        shortcutInputRef.current &&
        !shortcutInputRef.current.contains(event.target as Node)
      ) {
        setActiveShortcut(null);
        recordingStateRef.current = "";

        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
      }
    };

    if (activeShortcut) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [activeShortcut, setActiveShortcut]);

  // Early return if settings are still loading
  if (settingsLoading || !settings) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-foreground mb-2">
            General
          </h1>
          <p className="text-muted-foreground">
            Manage your profile and configure keyboard shortcuts
          </p>
        </div>

        {/* Account Section */}
        <AccountSection />

        {/* Previous App Content Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-medium text-foreground">
              Previous App Content
            </h2>
          </div>

          <div className="border border-border rounded-lg p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  Current App:
                </span>
                <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
                  {previousApp ? formatAppName(previousApp) : "None"}
                </span>
              </div>

              <div className="space-y-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Content:
                </span>
                <div className="bg-muted/50 rounded-md p-3 max-h-48 overflow-y-auto">
                  {previousAppContentRef.current ? (
                    <pre className="text-xs text-foreground whitespace-pre-wrap font-mono">
                      {typeof previousAppContentRef.current === "object"
                        ? previousAppContentRef.current ||
                          JSON.stringify(previousAppContentRef.current, null, 2)
                        : previousAppContentRef.current}
                    </pre>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      No content available
                    </p>
                  )}
                </div>
              </div>

              {previousAppContentRef.current && (
                <div className="text-xs text-muted-foreground">
                  Content length: {previousAppContentRef.current.length}{" "}
                  characters
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Keyboard Shortcuts Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-foreground">
              Keyboard Shortcuts
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetShortcuts}
              className="flex items-center gap-2 border-border hover:border-border/80"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
          </div>

          <div className="border border-border rounded-lg divide-y divide-border">
            {settings?.shortcuts
              ?.filter((s) => ["activate", "open_settings"].includes(s.id))
              .map((shortcut) => (
                <div
                  key={shortcut.id}
                  className="flex items-center justify-between p-4"
                >
                  <div>
                    <h4 className="font-medium text-foreground">
                      {shortcut.name}
                    </h4>
                  </div>
                  <button
                    ref={
                      activeShortcut === shortcut.id
                        ? shortcutInputRef
                        : undefined
                    }
                    onClick={() => startRecording(shortcut.id)}
                    className={`px-3 py-1.5 text-sm font-medium rounded transition-all ${
                      activeShortcut === shortcut.id
                        ? "bg-primary/20 text-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
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
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
