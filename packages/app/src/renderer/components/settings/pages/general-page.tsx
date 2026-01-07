import { Button } from "@/renderer/components/ui/button";
import { authClient } from "@/renderer/libs/auth-client";
import { useModelConfigStore } from "@/renderer/libs/stores/model-config-store";
import { useSettingsStore } from "@/renderer/libs/stores/settings-store";
import {
  Edit2,
  Key,
  Loader2,
  Plus,
  RotateCcw,
  Satellite,
  Trash2,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ModelConfigForm } from "../../../components/auth/model-config-form";

export function GeneralSettingsPage() {
  // Refs for shortcut recording
  const shortcutInputRef = useRef<HTMLButtonElement>(null);
  const recordingStateRef = useRef<string>("");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Model Config state
  const [showAddConfigModal, setShowAddConfigModal] = useState(false);
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null);
  const { modelConfigs, removeModelConfig, subscribeToModelConfigChanges } =
    useModelConfigStore();
  const { data: session } = authClient.useSession();

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

  // Initialize stores on component mount (only once)
  useEffect(() => {
    initializeSettings();
    const unsubscribeSettings = subscribeToSettingsChanges();
    const unsubscribeModelConfigs = subscribeToModelConfigChanges();
    return () => {
      unsubscribeSettings();
      unsubscribeModelConfigs();
    };
  }, [
    initializeSettings,
    subscribeToSettingsChanges,
    subscribeToModelConfigChanges,
  ]);

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
            Configure keyboard shortcuts and general preferences
          </p>
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

        {/* Model Configurations Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-foreground">
              Model Configurations
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingConfigId(null);
                setShowAddConfigModal(true);
              }}
              className="flex items-center gap-2 border-border hover:border-border/80"
            >
              <Plus className="h-4 w-4" />
              Add Configuration
            </Button>
          </div>

          <div className="border border-border rounded-lg divide-y divide-border">
            {/* Foxychat Remote (always shown if logged in) */}
            {session?.user && (
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center">
                    <Satellite className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <h4 className="font-medium text-foreground">Foxychat</h4>
                    <p className="text-xs text-muted-foreground">
                      Remote server (logged in)
                    </p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                  Default
                </span>
              </div>
            )}

            {/* Custom Model Configs */}
            {modelConfigs.map((config) => (
              <div
                key={config.id}
                className="flex items-center justify-between p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                    <Key className="h-4 w-4 text-orange-500" />
                  </div>
                  <div>
                    <h4 className="font-medium text-foreground">
                      {config.name}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      {config.models.length} model
                      {config.models.length !== 1 ? "s" : ""} configured
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setEditingConfigId(config.id);
                      setShowAddConfigModal(true);
                    }}
                    className="h-8 w-8"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeModelConfig(config.id)}
                    className="h-8 w-8 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}

            {/* Empty state */}
            {!session?.user && modelConfigs.length === 0 && (
              <div className="p-8 text-center">
                <Key className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">
                  No model configurations yet
                </p>
                <p className="text-muted-foreground text-xs mt-1">
                  Add a configuration to use your own API
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add/Edit Model Config Modal */}
      {showAddConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-lg mx-4">
            <ModelConfigForm
              editingConfigId={editingConfigId || undefined}
              onSuccess={() => {
                setShowAddConfigModal(false);
                setEditingConfigId(null);
              }}
            />
            <Button
              variant="ghost"
              className="w-full mt-2"
              onClick={() => {
                setShowAddConfigModal(false);
                setEditingConfigId(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
