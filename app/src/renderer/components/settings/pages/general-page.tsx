import { AIModelSection } from "@/renderer/components/settings/ai-model-section";
import { ShortcutsSection } from "@/renderer/components/settings/shortcuts-section";
import { Switch } from "@/renderer/components/ui/switch";
import { useChatContext } from "@/renderer/libs/stores/chat-store";
import { useSettingsStore } from "@/renderer/libs/stores/settings-store";
import React, { useCallback, useEffect, useRef } from "react";

export function GeneralSettingsPage() {
  // Refs for shortcut recording
  const shortcutInputRef = useRef<HTMLButtonElement>(null);
  const recordingStateRef = useRef<string>("");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Settings Store
  const {
    settings,
    settingsLoading,
    activeShortcut,
    recordingShortcut,
    initializeSettings,
    handleOpenAIChange,
    handleAddSupportedModel,
    handleRemoveSupportedModel,
    handleResetShortcuts,
    setActiveShortcut,
    setRecordingShortcut,
    saveRecordedShortcut,
    subscribeToSettingsChanges,
  } = useSettingsStore();

  // Chat Store
  const { useRemoteStore, setUseRemoteStore, isUserLoggedIn } =
    useChatContext();

  // Initialize stores on component mount
  useEffect(() => {
    initializeSettings();
    const unsubscribe = subscribeToSettingsChanges();
    return unsubscribe;
  }, [initializeSettings, subscribeToSettingsChanges]);

  // Callback functions for shortcut recording
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

  // Shortcut Recording Logic
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
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      {/* Remote Server Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            API Settings
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Choose between remote server or your custom API
          </p>
        </div>

        {isUserLoggedIn ? (
          <div className="border border-border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-foreground">
                  Use Remote Server
                </h3>
                <p className="text-sm text-muted-foreground">
                  Use our remote server service for AI requests
                </p>
              </div>
              <Switch
                checked={useRemoteStore}
                onCheckedChange={(checked) => setUseRemoteStore(checked)}
              />
            </div>
          </div>
        ) : (
          <div className="border border-border rounded-lg p-4 opacity-60">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-foreground">
                  Use Remote Server
                </h3>
                <p className="text-sm text-muted-foreground">
                  Login required to use remote server service
                </p>
              </div>
              <Switch checked={false} disabled={true} />
            </div>
            <div className="mt-2 text-xs text-orange-600">
              Please login to enable remote server. Currently using custom API.
            </div>
          </div>
        )}
      </div>

      {/* Only show AI Model Settings when not using remote server */}
      {!(isUserLoggedIn && useRemoteStore) && (
        <div>
          <AIModelSection
            settings={settings}
            onOpenAIChange={handleOpenAIChange}
            onAddSupportedModel={handleAddSupportedModel}
            onRemoveSupportedModel={handleRemoveSupportedModel}
          />
        </div>
      )}

      <div>
        <ShortcutsSection
          settings={settings}
          activeShortcut={activeShortcut}
          recordingShortcut={recordingShortcut}
          shortcutInputRef={
            shortcutInputRef as React.RefObject<HTMLButtonElement>
          }
          onStartRecording={startRecording}
          onResetShortcuts={handleResetShortcuts}
        />
      </div>
    </div>
  );
}
