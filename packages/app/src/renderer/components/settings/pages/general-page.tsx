import { ProfileSection } from "@/renderer/components/settings/profile-section";
import { Button } from "@/renderer/components/ui/button";
import { Input } from "@/renderer/components/ui/input";
import { useLocalAIProviders } from "@/renderer/libs/hooks/use-local-ai-providers";
import { describeProviderStatus } from "@/renderer/libs/provider-status";
import {
  DEFAULT_LOCAL_AI_MODEL_ID,
  isLocalAIProviderId,
} from "@/renderer/libs/local-ai";
import { useModelConfigStore } from "@/renderer/libs/stores/model-config-store";
import { useSettingsStore } from "@/renderer/libs/stores/settings-store";
import {
  MAX_MEMORY_BATCH_SIZE,
  MIN_MEMORY_BATCH_SIZE,
  isValidMemoryBatchSize,
} from "@/renderer/libs/memory-settings-constraints";
import type {
  LocalAIMemorySettings,
  LocalAIMemorySettingsUpdate,
  LocalAIMemoryStatus,
} from "@/shared/types/local-ai";
import {
  LOCAL_AI_MEMORY_PROVIDERS,
  isLocalAIMemoryProvider,
} from "@/shared/types/local-ai";
import {
  Check,
  Cpu,
  Database,
  Keyboard,
  Loader2,
  RotateCcw,
  Terminal,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  MEMORY_CURATOR_OPTIONS,
  createMemoryCuratorUpdate,
} from "./memory-curator-options";

export const MEMORY_PROVIDER_OPTIONS = LOCAL_AI_MEMORY_PROVIDERS.map(
  (value) => ({
    value,
    label: value === "off" ? "Off" : "Local",
  }),
);

export function createMemoryProviderUpdate(
  value: string,
): LocalAIMemorySettingsUpdate | null {
  return isLocalAIMemoryProvider(value) ? { provider: value } : null;
}

export function GeneralSettingsPage() {
  // Refs for shortcut recording
  const shortcutInputRef = useRef<HTMLButtonElement>(null);
  const recordingStateRef = useRef<string>("");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Model Config state
  const { defaultConfigId, setDefaultModel, subscribeToModelConfigChanges } =
    useModelConfigStore();
  const {
    providers,
    loading: providersLoading,
    refresh: refreshProviders,
  } = useLocalAIProviders();
  const [memorySettings, setMemorySettings] =
    useState<LocalAIMemorySettings | null>(null);
  const [memoryStatus, setMemoryStatus] = useState<LocalAIMemoryStatus | null>(
    null,
  );
  const [memorySaving, setMemorySaving] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);

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

  const refreshMemoryConfiguration = useCallback(async () => {
    setMemoryError(null);
    try {
      const [settingsResult, statusResult] = await Promise.all([
        window.localAI.getMemorySettings(),
        window.localAI.getMemoryStatus(),
      ]);
      if (!settingsResult.success || !settingsResult.data) {
        throw new Error(
          settingsResult.error?.message || "Could not load memory settings.",
        );
      }
      setMemorySettings(settingsResult.data);
      if (!statusResult.success || !statusResult.data) {
        throw new Error(
          statusResult.error?.message || "Could not load memory status.",
        );
      }
      setMemoryStatus(statusResult.data);
    } catch (error) {
      setMemoryError(
        error instanceof Error
          ? error.message
          : "Could not load memory settings.",
      );
    }
  }, []);

  useEffect(() => {
    void refreshMemoryConfiguration();
  }, [refreshMemoryConfiguration]);

  const updateMemoryConfiguration = useCallback(
    async (update: LocalAIMemorySettingsUpdate) => {
      setMemorySaving(true);
      setMemoryError(null);
      try {
        const result = await window.localAI.updateMemorySettings(update);
        if (!result.success || !result.data) {
          throw new Error(
            result.error?.message || "Could not update memory settings.",
          );
        }
        setMemorySettings(result.data);
        const statusResult = await window.localAI.getMemoryStatus();
        if (statusResult.success && statusResult.data) {
          setMemoryStatus(statusResult.data);
        }
      } catch (error) {
        setMemoryError(
          error instanceof Error
            ? error.message
            : "Could not update memory settings.",
        );
      } finally {
        setMemorySaving(false);
      }
    },
    [],
  );

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

        <ProfileSection />

        {/* Keyboard Shortcuts Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Keyboard className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-medium text-foreground">
                Keyboard Shortcuts
              </h2>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetShortcuts}
              className="flex items-center gap-2 border-border"
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
          <div>
            <div className="flex items-center gap-2">
              <Cpu className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-medium text-foreground">
                Local AI Providers
              </h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose the provider Convera uses for new chats. An agent pinned to
              a provider listed here as unavailable cannot answer. Your
              selection is stored only on this device.
            </p>
            <button
              type="button"
              onClick={() => void refreshProviders()}
              disabled={providersLoading}
              className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground transition-colors pointer-events-auto hover:text-foreground disabled:opacity-60"
            >
              <RotateCcw className="h-3 w-3" />
              Re-check providers
            </button>
          </div>

          <div className="border border-border rounded-lg divide-y divide-border">
            {providers.map((provider) => {
              const isSelected = provider.id === defaultConfigId;
              const status = describeProviderStatus(provider, providersLoading);
              const canSelect =
                status.ready && isLocalAIProviderId(provider.id);

              return (
                <button
                  key={provider.id}
                  type="button"
                  data-testid={`local-ai-provider-${provider.id}`}
                  aria-pressed={isSelected}
                  disabled={!canSelect}
                  onClick={() => {
                    if (isLocalAIProviderId(provider.id)) {
                      setDefaultModel(provider.id, DEFAULT_LOCAL_AI_MODEL_ID);
                    }
                  }}
                  className="flex w-full items-center justify-between p-4 text-left transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                      <Terminal className="h-4 w-4 text-foreground" />
                    </div>
                    <div>
                      <h4 className="font-medium text-foreground">
                        {provider.name}
                      </h4>
                      {/* The hint is the whole point of this row: an agent
                          pinned to a provider fails for exactly this reason,
                          and this is where you find out which. */}
                      <p className="text-xs text-muted-foreground">
                        {status.hint ?? status.label}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        status.ready
                          ? "text-primary bg-primary/10"
                          : "text-muted-foreground bg-muted"
                      }`}
                    >
                      {status.label}
                    </span>
                    <span
                      className={`flex min-w-16 items-center justify-end gap-1 text-xs ${
                        isSelected ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {isSelected && <Check className="h-3.5 w-3.5" />}
                      {isSelected ? "Selected" : "Select"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-medium text-foreground">
                Memory and Context
              </h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Store memory locally. An isolated provider session can curate
              completed turns without blocking the reply.
            </p>
          </div>

          <div className="border border-border rounded-lg divide-y divide-border">
            <label className="flex items-center justify-between gap-4 p-4">
              <div>
                <span className="font-medium text-foreground">
                  Memory provider
                </span>
                <p className="text-xs text-muted-foreground">
                  Off pauses memory without deleting it. Local keeps memory on
                  this device.
                </p>
              </div>
              <select
                aria-label="Memory provider"
                value={memorySettings?.provider ?? "off"}
                disabled={!memorySettings || memorySaving}
                onChange={(event) => {
                  const update = createMemoryProviderUpdate(event.target.value);
                  if (update) {
                    void updateMemoryConfiguration(update);
                  }
                }}
                className="min-w-36 rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground"
              >
                {MEMORY_PROVIDER_OPTIONS.map((provider) => (
                  <option key={provider.value} value={provider.value}>
                    {provider.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center justify-between gap-4 p-4">
              <div>
                <span className="font-medium text-foreground">
                  Background curator
                </span>
                <p className="text-xs text-muted-foreground">
                  Uses an isolated text-only provider session. API providers may
                  incur usage charges.
                </p>
              </div>
              <select
                aria-label="Background curator"
                value={memorySettings?.subconsciousProvider ?? "off"}
                disabled={!memorySettings || memorySaving}
                onChange={(event) => {
                  const update = createMemoryCuratorUpdate(event.target.value);
                  if (update) {
                    void updateMemoryConfiguration(update);
                  }
                }}
                className="min-w-44 rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground"
              >
                {MEMORY_CURATOR_OPTIONS.map((provider) => (
                  <option key={provider.value} value={provider.value}>
                    {provider.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center justify-between gap-4 p-4">
              <div>
                <span className="font-medium text-foreground">
                  Consolidation schedule
                </span>
                <p className="text-xs text-muted-foreground">
                  Run after every turn, in batches, or while idle.
                </p>
              </div>
              <select
                aria-label="Memory consolidation schedule"
                value={memorySettings?.schedule ?? "every-turn"}
                disabled={!memorySettings || memorySaving}
                onChange={(event) =>
                  void updateMemoryConfiguration({
                    schedule: event.target
                      .value as LocalAIMemorySettings["schedule"],
                  })
                }
                className="min-w-36 rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground"
              >
                <option value="every-turn">Every turn</option>
                <option value="batch">Batch</option>
                <option value="idle">Idle</option>
              </select>
            </label>

            {memorySettings?.schedule === "batch" && (
              <label className="flex items-center justify-between gap-4 p-4">
                <span className="text-sm text-foreground">Batch size</span>
                <Input
                  key={memorySettings.batchSize}
                  type="number"
                  min={MIN_MEMORY_BATCH_SIZE}
                  max={MAX_MEMORY_BATCH_SIZE}
                  defaultValue={memorySettings.batchSize}
                  disabled={memorySaving}
                  onBlur={(event) => {
                    const batchSize = Number(event.target.value);
                    if (
                      isValidMemoryBatchSize(batchSize) &&
                      batchSize !== memorySettings.batchSize
                    ) {
                      void updateMemoryConfiguration({ batchSize });
                    }
                  }}
                  className="w-28 bg-transparent"
                />
              </label>
            )}

            {memorySettings?.schedule === "idle" && (
              <label className="flex items-center justify-between gap-4 p-4">
                <span className="text-sm text-foreground">
                  Idle delay (seconds)
                </span>
                <Input
                  key={memorySettings.idleDelayMs}
                  type="number"
                  min={1}
                  max={3600}
                  defaultValue={Math.round(memorySettings.idleDelayMs / 1000)}
                  disabled={memorySaving}
                  onBlur={(event) => {
                    const seconds = Number(event.target.value);
                    const idleDelayMs = seconds * 1000;
                    if (
                      Number.isFinite(seconds) &&
                      seconds >= 1 &&
                      seconds <= 3600 &&
                      idleDelayMs !== memorySettings.idleDelayMs
                    ) {
                      void updateMemoryConfiguration({ idleDelayMs });
                    }
                  }}
                  className="w-28 bg-transparent"
                />
              </label>
            )}

            <div className="flex items-center justify-between gap-4 p-4">
              <div>
                <span className="font-medium text-foreground">
                  Memory status
                </span>
                <p className="text-xs text-muted-foreground">
                  {memoryError ||
                    memoryStatus?.detail ||
                    "Memory runtime has not reported a status yet."}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {memorySaving
                  ? "Saving…"
                  : `${memoryStatus?.health ?? "unknown"} · ${
                      memoryStatus?.pendingJobs ?? 0
                    } pending · ${memoryStatus?.failedJobs ?? 0} failed`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
