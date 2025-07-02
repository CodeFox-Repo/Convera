import { Badge } from "@/renderer/components/ui/badge";
import { Button } from "@/renderer/components/ui/button";
import { Input } from "@/renderer/components/ui/input";
import { Label } from "@/renderer/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/renderer/components/ui/select";
import { Switch } from "@/renderer/components/ui/switch";
import { useChatContext } from "@/renderer/libs/stores/chat-store";
import { useModelStore } from "@/renderer/libs/stores/model-store";
import { useSettingsStore } from "@/renderer/libs/stores/settings-store";
import {
  loadFuzzyInstance,
  searchModels,
} from "@/renderer/libs/utils/model-search-utils";
import {
  OFFICIAL_MODELS,
  fetchOpenRouterModels,
} from "@/shared/constants/officialModels";
import { Loader2, RotateCcw, X } from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
    handleResetShortcuts,
    setActiveShortcut,
    setRecordingShortcut,
    saveRecordedShortcut,
    subscribeToSettingsChanges,
  } = useSettingsStore();

  // Chat Store
  const { useRemoteStore, setUseRemoteStore, isUserLoggedIn } =
    useChatContext();

  // Model Store
  const {
    supportedModelIds,
    setSupportedModelIds,
    setSelectedModelId,
    subscribeToModelChanges,
  } = useModelStore();

  // Model management state
  const [newModelInput, setNewModelInput] = useState("");
  const [officialModels, setOfficialModels] =
    useState<string[]>(OFFICIAL_MODELS);
  const [showDropdown, setShowDropdown] = useState(false);
  const [filteredModels, setFilteredModels] = useState<string[]>([]);

  // Initialize stores on component mount
  useEffect(() => {
    initializeSettings();
    const unsubscribeSettings = subscribeToSettingsChanges();
    const unsubscribeModels = subscribeToModelChanges();
    return () => {
      unsubscribeSettings();
      unsubscribeModels();
    };
  }, [initializeSettings, subscribeToSettingsChanges, subscribeToModelChanges]);

  // Fetch models from OpenRouter API
  useEffect(() => {
    fetchOpenRouterModels()
      .then((models) => {
        setOfficialModels([...models].sort());
      })
      .catch(() => {
        setOfficialModels([...OFFICIAL_MODELS].sort());
      });
  }, []);

  // Available models list
  const availableModels = useMemo(
    () => officialModels.filter((m) => !supportedModelIds.includes(m)),
    [officialModels, supportedModelIds],
  );

  // Memoize fuzzy instance for model search
  const fuzzyInstance = useMemo(() => loadFuzzyInstance(), [availableModels]);

  // Update filtered models when input or availableModels changes
  useEffect(() => {
    searchModels(
      newModelInput,
      availableModels,
      setFilteredModels,
      fuzzyInstance,
    );
  }, [newModelInput, availableModels, fuzzyInstance]);

  // Model management functions
  const handleAddModel = (model: string) => {
    if (!model.trim()) return;

    const newModels = [...supportedModelIds];
    if (!newModels.includes(model)) {
      newModels.push(model);
      setSupportedModelIds(newModels);
    }
    setTimeout(() => {
      handleOpenAIChange("modelId", model);
      setSelectedModelId(model);
    }, 0);
  };

  const handleRemoveModel = (model: string) => {
    const newModels = supportedModelIds.filter((m) => m !== model);
    setSupportedModelIds(newModels);
    if (model === settings?.openai?.modelId) {
      const newSelectedModel = newModels.length > 0 ? newModels[0] : "";
      setSelectedModelId(newSelectedModel);
    }
  };

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
            Configure API settings and keyboard shortcuts
          </p>
        </div>

        {/* API Settings Section */}
        <div className="space-y-4">
          <h2 className="text-lg font-medium text-foreground">API Settings</h2>

          {/* Remote Server Toggle */}
          {isUserLoggedIn ? (
            <div className="p-4 border border-border rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-foreground">
                    Use Remote Server
                  </h4>
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
            <div className="p-4 border border-border rounded-lg bg-muted/20">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-foreground">
                    Use Remote Server
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Login required to use remote server service
                  </p>
                </div>
                <Switch checked={false} disabled={true} />
              </div>
              <div className="mt-2 text-xs text-orange-600">
                Please login to enable remote server. Currently using custom
                API.
              </div>
            </div>
          )}

          {/* Custom API Settings - only show when not using remote server */}
          {!(isUserLoggedIn && useRemoteStore) && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label
                  htmlFor="endpoint"
                  className="text-sm font-medium text-foreground"
                >
                  API Endpoint
                </Label>
                <Input
                  id="endpoint"
                  value={settings?.openai?.endpoint || ""}
                  onChange={(e) =>
                    handleOpenAIChange("endpoint", e.target.value)
                  }
                  placeholder="https://api.openai.com/v1"
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="apiKey"
                  className="text-sm font-medium text-foreground"
                >
                  API Key
                </Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={settings?.openai?.apiKey || ""}
                  onChange={(e) => handleOpenAIChange("apiKey", e.target.value)}
                  placeholder="sk-..."
                />
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="modelId"
                  className="text-sm font-medium text-foreground"
                >
                  Model ID
                </Label>
                <Select
                  value={settings?.openai?.modelId || ""}
                  onValueChange={(value) => {
                    setSelectedModelId(value);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a model">
                      {settings?.openai?.modelId || ""}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {supportedModelIds.map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Model Management */}
              <div className="pt-4 border-t border-border">
                <Label className="text-sm font-medium text-foreground mb-3 block">
                  Manage Models
                </Label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {supportedModelIds.map((model) => (
                    <Badge
                      key={model}
                      variant="outline"
                      className="flex items-center gap-1 px-2 py-1 border-gray-300 hover:border-gray-400"
                    >
                      {model}
                      <button
                        className="hover:bg-destructive/20 ml-1 rounded-full"
                        onClick={() => handleRemoveModel(model)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      placeholder="Add a new model ID"
                      value={newModelInput}
                      onChange={(e) => setNewModelInput(e.target.value)}
                      onFocus={() => setShowDropdown(true)}
                      onBlur={() => {
                        setTimeout(() => setShowDropdown(false), 200);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newModelInput.trim()) {
                          handleAddModel(newModelInput.trim());
                          setNewModelInput("");
                        }
                      }}
                      autoComplete="off"
                    />
                    {showDropdown && (
                      <ul className="absolute z-10 mt-1 w-full bg-background rounded-md border border-border max-h-40 overflow-auto py-1">
                        {filteredModels.length > 0 ? (
                          filteredModels.map((model) => (
                            <li
                              key={model}
                              onMouseDown={() => {
                                handleAddModel(model);
                                setNewModelInput("");
                              }}
                              className="relative flex items-center px-3 py-2 text-sm select-none cursor-pointer hover:bg-muted/50 transition-colors"
                            >
                              {model}
                            </li>
                          ))
                        ) : (
                          <li className="px-3 py-2 text-muted-foreground text-xs">
                            No matching models found
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                  <Button
                    onClick={() => {
                      if (newModelInput.trim()) {
                        handleAddModel(newModelInput.trim());
                        setNewModelInput("");
                      }
                    }}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>
          )}
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
              className="flex items-center gap-2"
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
