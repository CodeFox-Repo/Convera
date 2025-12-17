import { Button } from "@/renderer/components/ui/button";
import { Input } from "@/renderer/components/ui/input";
import { Label } from "@/renderer/components/ui/label";
import { useSettingsStore } from "@/renderer/libs/stores/settings-store";
import { Loader2 } from "lucide-react";
import React, { useState } from "react";
import { toast } from "sonner";

interface ValidationErrors {
  endpoint?: string;
  apiKey?: string;
}

export function CustomApiForm() {
  const [endpoint, setEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const { handleOpenAIChange } = useSettingsStore();

  const validateForm = (): boolean => {
    const newErrors: ValidationErrors = {};

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

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleTestConnection = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      // Test API connection by making a simple request to models endpoint
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
      // Save both fields and disable remote store
      await handleOpenAIChange("endpoint", endpoint);
      await handleOpenAIChange("apiKey", apiKey);
      await handleOpenAIChange("useRemoteStore", "false");

      toast.success("Custom API configured successfully!");
      // Dispatch event to close modal
      window.dispatchEvent(new CustomEvent("custom-api-configured"));
    } catch (error) {
      console.error("Failed to save settings:", error);
      toast.error("Failed to save settings");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-6 bg-card rounded-lg">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-bold text-primary">
          Configure Custom API
        </h2>
        <p className="text-foreground/80 text-sm">
          Use your own OpenAI-compatible API (e.g., OpenRouter)
        </p>
      </div>

      <div className="space-y-4">
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
            aria-invalid={!!errors.endpoint}
            disabled={isLoading}
          />
          {errors.endpoint && (
            <p className="text-destructive text-sm">{errors.endpoint}</p>
          )}
        </div>

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
            aria-invalid={!!errors.apiKey}
            disabled={isLoading}
          />
          {errors.apiKey && (
            <p className="text-destructive text-sm">{errors.apiKey}</p>
          )}
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        <Button
          variant="outline"
          onClick={handleTestConnection}
          disabled={isLoading}
          className="flex-1"
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
          ) : (
            "Save & Use"
          )}
        </Button>
      </div>
    </div>
  );
}
