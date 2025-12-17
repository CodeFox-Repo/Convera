import { Button } from "@/renderer/components/ui/button";
import { Input } from "@/renderer/components/ui/input";
import { Label } from "@/renderer/components/ui/label";
import {
  fetchModelsFromEndpoint,
  useModelConfigStore,
} from "@/renderer/libs/stores/model-config-store";
import { Check, Loader2, Search, X } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface ValidationErrors {
  name?: string;
  endpoint?: string;
  apiKey?: string;
  models?: string;
}

const DEFAULT_ENDPOINT = "https://openrouter.ai/api/v1";
const DEFAULT_NAME = "OpenRouter";

interface ModelConfigFormProps {
  onSuccess?: () => void;
  editingConfigId?: string;
}

export function ModelConfigForm({
  onSuccess,
  editingConfigId,
}: ModelConfigFormProps) {
  const { addModelConfig, updateModelConfig, getConfigById } =
    useModelConfigStore();

  // Load existing config if editing
  const existingConfig = editingConfigId
    ? getConfigById(editingConfigId)
    : undefined;

  const [name, setName] = useState(existingConfig?.name || DEFAULT_NAME);
  const [endpoint, setEndpoint] = useState(
    existingConfig?.endpoint || DEFAULT_ENDPOINT,
  );
  const [apiKey, setApiKey] = useState(existingConfig?.apiKey || "");
  const [selectedModels, setSelectedModels] = useState<Set<string>>(
    new Set(existingConfig?.models || []),
  );
  const [availableModels, setAvailableModels] = useState<string[]>(
    existingConfig?.models || [],
  );
  const [modelFilter, setModelFilter] = useState("");
  const [errors, setErrors] = useState<ValidationErrors>({});

  // Convert selected models set to array for validation and saving
  const models = Array.from(selectedModels);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const lastFetchedEndpointRef = useRef<string>("");

  const validateForm = (): boolean => {
    const newErrors: ValidationErrors = {};

    // Validate name
    if (!name.trim()) {
      newErrors.name = "Configuration name is required";
    }

    // Validate endpoint
    if (!endpoint.trim()) {
      newErrors.endpoint = "API endpoint is required";
    } else {
      try {
        const url = new URL(endpoint);
        if (!url.protocol.startsWith("http")) {
          newErrors.endpoint = "Endpoint must use HTTP or HTTPS";
        }
      } catch {
        newErrors.endpoint = "Invalid URL format";
      }
    }

    // Validate API key
    if (!apiKey.trim()) {
      newErrors.apiKey = "API key is required";
    } else if (apiKey.startsWith("Bearer ")) {
      newErrors.apiKey = 'Please enter the API key without "Bearer" prefix';
    }

    // Validate models (at least one required)
    if (models.length === 0) {
      newErrors.models = "At least one model is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFetchModels = useCallback(async () => {
    if (!endpoint.trim()) {
      return;
    }

    // Skip if we already fetched for this endpoint + apiKey combo
    const fetchKey = `${endpoint.trim()}:${apiKey.trim()}`;
    if (lastFetchedEndpointRef.current === fetchKey) {
      return;
    }

    setIsFetchingModels(true);
    try {
      const fetchedModels = await fetchModelsFromEndpoint(endpoint, apiKey);
      lastFetchedEndpointRef.current = fetchKey;

      if (fetchedModels.length === 0) {
        toast.warning("No models found from this endpoint");
        return;
      }

      // Set available models (don't auto-select)
      setAvailableModels(fetchedModels);
      setErrors((prev) => ({ ...prev, models: undefined }));

      toast.success(`Found ${fetchedModels.length} models`);
    } catch (error) {
      console.error("Failed to fetch models:", error);
      toast.error("Failed to fetch models. Check your endpoint and API key.");
    } finally {
      setIsFetchingModels(false);
    }
  }, [endpoint, apiKey]);

  const handleEndpointBlur = useCallback(() => {
    // Auto-fetch models when user leaves endpoint input
    if (endpoint.trim()) {
      handleFetchModels();
    }
  }, [endpoint, handleFetchModels]);

  // Auto-fetch models when endpoint is filled (apiKey is optional for public APIs)
  useEffect(() => {
    if (endpoint.trim() && models.length === 0) {
      // Debounce to avoid fetching on every keystroke
      const timer = setTimeout(() => {
        handleFetchModels();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [endpoint, apiKey, models.length, handleFetchModels]);

  const handleToggleModel = (modelId: string) => {
    setSelectedModels((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(modelId)) {
        newSet.delete(modelId);
      } else {
        newSet.add(modelId);
      }
      return newSet;
    });
    setErrors((prev) => ({ ...prev, models: undefined }));
  };

  const handleSelectAll = () => {
    setSelectedModels(new Set(filteredModels));
    setErrors((prev) => ({ ...prev, models: undefined }));
  };

  const handleDeselectAll = () => {
    setSelectedModels(new Set());
  };

  // Filter models based on search input
  const filteredModels = availableModels.filter((model) =>
    model.toLowerCase().includes(modelFilter.toLowerCase()),
  );

  const handleTestConnection = async () => {
    if (!endpoint.trim() || !apiKey.trim()) {
      toast.error("Please enter endpoint and API key first");
      return;
    }

    setIsLoading(true);
    try {
      const testEndpoint = endpoint.endsWith("/v1")
        ? `${endpoint}/models`
        : `${endpoint}/models`;

      const response = await fetch(testEndpoint, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        toast.success("Connection successful!");
      } else if (response.status === 401) {
        toast.error("Invalid API key");
      } else {
        toast.error(`Connection failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error("Connection test failed:", error);
      toast.error("Failed to connect to API. Check your endpoint.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    // Warn if endpoint doesn't end with /v1
    if (!endpoint.endsWith("/v1")) {
      toast.warning("Tip: Most OpenAI-compatible APIs use /v1 endpoint");
    }

    setIsLoading(true);
    try {
      if (editingConfigId) {
        // Update existing config
        updateModelConfig(editingConfigId, {
          name,
          endpoint,
          apiKey,
          models,
        });
        toast.success("Configuration updated successfully!");
      } else {
        // Add new config
        addModelConfig({
          name,
          endpoint,
          apiKey,
          models,
        });
        toast.success("Configuration added successfully!");
      }

      // Dispatch event to close modal
      window.dispatchEvent(new CustomEvent("model-config-saved"));
      onSuccess?.();
    } catch (error) {
      console.error("Failed to save configuration:", error);
      toast.error("Failed to save configuration");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-6 bg-card rounded-md">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-bold text-primary">
          {editingConfigId
            ? "Edit Model Configuration"
            : "Add Model Configuration"}
        </h2>
        <p className="text-foreground/80 text-sm">
          Configure an OpenAI-compatible API endpoint
        </p>
      </div>

      <div className="space-y-4">
        {/* Config Name */}
        <div className="space-y-2">
          <Label htmlFor="configName" className="text-foreground">
            Configuration Name
          </Label>
          <Input
            id="configName"
            type="text"
            placeholder="My OpenRouter"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setErrors((prev) => ({ ...prev, name: undefined }));
            }}
            aria-invalid={!!errors.name}
            disabled={isLoading}
          />
          {errors.name && (
            <p className="text-destructive text-sm">{errors.name}</p>
          )}
        </div>

        {/* API Endpoint */}
        <div className="space-y-2">
          <Label htmlFor="endpoint" className="text-foreground">
            API Endpoint
          </Label>
          <Input
            id="endpoint"
            type="text"
            placeholder="https://openrouter.ai/api/v1"
            value={endpoint}
            onChange={(e) => {
              setEndpoint(e.target.value);
              setErrors((prev) => ({ ...prev, endpoint: undefined }));
            }}
            onBlur={handleEndpointBlur}
            aria-invalid={!!errors.endpoint}
            disabled={isLoading}
          />
          {errors.endpoint && (
            <p className="text-destructive text-sm">{errors.endpoint}</p>
          )}
        </div>

        {/* API Key */}
        <div className="space-y-2">
          <Label htmlFor="apiKey" className="text-foreground">
            API Key
          </Label>
          <Input
            id="apiKey"
            type="password"
            placeholder="sk-..."
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setErrors((prev) => ({ ...prev, apiKey: undefined }));
            }}
            onBlur={handleEndpointBlur}
            aria-invalid={!!errors.apiKey}
            disabled={isLoading}
          />
          {errors.apiKey && (
            <p className="text-destructive text-sm">{errors.apiKey}</p>
          )}
        </div>

        {/* Models Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-foreground">
              Available Models
              {selectedModels.size > 0 && (
                <span className="ml-2 text-xs text-muted-foreground">
                  ({selectedModels.size} selected)
                </span>
              )}
            </Label>
            {isFetchingModels && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Fetching...</span>
              </div>
            )}
          </div>

          {/* Search/Filter input */}
          {availableModels.length > 0 && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search models..."
                value={modelFilter}
                onChange={(e) => setModelFilter(e.target.value)}
                disabled={isLoading}
                className="pl-8 h-8 text-sm"
              />
              {modelFilter && (
                <button
                  type="button"
                  onClick={() => setModelFilter("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Select all / Deselect all */}
          {availableModels.length > 0 && (
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-primary hover:underline"
                disabled={isLoading}
              >
                Select all
              </button>
              <span className="text-muted-foreground">|</span>
              <button
                type="button"
                onClick={handleDeselectAll}
                className="text-muted-foreground hover:text-foreground hover:underline"
                disabled={isLoading}
              >
                Deselect all
              </button>
            </div>
          )}

          {/* Model list */}
          <div className="max-h-48 overflow-y-auto border border-border/50 rounded-md">
            {availableModels.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">
                {isFetchingModels
                  ? "Loading models..."
                  : "Enter endpoint to load models"}
              </p>
            ) : filteredModels.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">
                No models match &ldquo;{modelFilter}&rdquo;
              </p>
            ) : (
              <div>
                {filteredModels.map((model) => {
                  const isSelected = selectedModels.has(model);
                  return (
                    <button
                      key={model}
                      type="button"
                      onClick={() => handleToggleModel(model)}
                      disabled={isLoading}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-muted/20"
                    >
                      <div
                        className={`flex-shrink-0 w-4 h-4 rounded-sm border transition-colors ${
                          isSelected
                            ? "bg-primary/90 border-primary"
                            : "border-muted-foreground/40 bg-transparent"
                        }`}
                      >
                        {isSelected && (
                          <Check
                            className="h-4 w-4 text-primary-foreground"
                            strokeWidth={3}
                          />
                        )}
                      </div>
                      <span
                        className={`truncate ${isSelected ? "text-foreground" : "text-foreground/70"}`}
                      >
                        {model}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {errors.models && (
            <p className="text-destructive text-sm">{errors.models}</p>
          )}
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        <Button
          variant="outline"
          onClick={handleTestConnection}
          disabled={isLoading}
          className="flex-1 text-foreground"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Test Connection"
          )}
        </Button>
        <Button onClick={handleSave} disabled={isLoading} className="flex-1">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : editingConfigId ? (
            "Update"
          ) : (
            "Save Configuration"
          )}
        </Button>
      </div>
    </div>
  );
}
