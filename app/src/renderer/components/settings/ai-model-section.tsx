import React, { useEffect, useMemo, useState } from "react";

import { AppSettings } from "@/shared/types/settings";
import { X } from "lucide-react";

import { loadFuzzyInstance, searchModels } from "@/renderer/utils/model-search-utils";
import { OFFICIAL_MODELS, fetchOpenRouterModels } from "@/shared/constants/officialModels";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

type AIModelSectionProps = {
  settings: AppSettings;
  onOpenAIChange: (field: string, value: string) => void;
  onAddSupportedModel: (model: string) => void;
  onRemoveSupportedModel: (model: string) => void;
};

export function AIModelSection({
  settings,
  onOpenAIChange,
  onAddSupportedModel,
  onRemoveSupportedModel,
}: AIModelSectionProps) {
  const [newModelInput, setNewModelInput] = useState("");
  const [officialModels, setOfficialModels] = useState<string[]>(OFFICIAL_MODELS);
  const [showDropdown, setShowDropdown] = useState(false);
  const [filteredModels, setFilteredModels] = useState<string[]>([]);

  /**
   * Fetch models from OpenRouter API and sort them alphabetically.
   * Falls back to static model list if the fetch fails.
   */
  useEffect(() => {
    fetchOpenRouterModels()
      .then((models) => {
        setOfficialModels([...models].sort());
      })
      .catch(() => {
        setOfficialModels([...OFFICIAL_MODELS].sort());
      });
  }, []);

  // Get list of models that aren't already added
  const getAvailableModels = () => {
    return officialModels.filter(
      (m) => !settings.openai.supportedModels.includes(m)
    );
  };

  // Available models list
  const availableModels = useMemo(() => getAvailableModels(), [officialModels, settings.openai.supportedModels]);

  /**
   * Memoize fuzzy instance for model search
   */
  const fuzzyInstance = useMemo(() => loadFuzzyInstance(), [availableModels]);

  // Update filtered models when input or availableModels changes
  useEffect(() => {
    searchModels(newModelInput, availableModels, setFilteredModels, fuzzyInstance);
  }, [newModelInput, availableModels, fuzzyInstance]);

  /**
   * Add a model to supported models list, update localStorage,
   * and trigger events to notify other components
   */
  const handleAddModel = (model: string) => {
    if (!model.trim()) return;
    
    onAddSupportedModel(model);
    
    const newModels = [...settings.openai.supportedModels, model];
    localStorage.setItem("supportedModels", JSON.stringify(newModels));
    window.dispatchEvent(new Event("supportedModels-updated"));
    
    setTimeout(() => {
      onOpenAIChange("modelId", model);
    }, 0);
  };

  /**
   * Remove a model from supported models list, update localStorage,
   * and trigger events to notify other components
   */
  const handleRemoveModel = (model: string) => {
    onRemoveSupportedModel(model);
    
    const newModels = settings.openai.supportedModels.filter(m => m !== model);
    localStorage.setItem("supportedModels", JSON.stringify(newModels));
    window.dispatchEvent(new Event("supportedModels-updated"));
  };

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <div className="mb-4">
          <h2 className="text-2xl font-medium text-foreground">AI Model Settings</h2>
          <p className="text-muted-foreground mt-1">
            Configure your AI API settings
          </p>
        </div>
      </div>
      
      <div className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="endpoint" className="text-foreground">
            API Endpoint
          </Label>
          <Input
            id="endpoint"
            value={settings.openai.endpoint}
            onChange={(e) => onOpenAIChange("endpoint", e.target.value)}
            placeholder="https://api.openai.com/v1"
            className="border-input bg-background text-foreground"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="apiKey" className="text-foreground">
            API Key
          </Label>
          <Input
            id="apiKey"
            type="password"
            value={settings.openai.apiKey}
            onChange={(e) => onOpenAIChange("apiKey", e.target.value)}
            placeholder="sk-..."
            className="border-input bg-background text-foreground"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="modelId" className="text-foreground">
            Model ID
          </Label>
          <Select
            value={settings.openai.modelId}
            onValueChange={(value) => onOpenAIChange("modelId", value)}
          >
            <SelectTrigger className="border-input bg-background text-foreground w-full rounded-md">
              <SelectValue placeholder="Select a model">
                {settings.openai.modelId}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="w-full border-none shadow-none">
              {settings.openai.supportedModels.map((model) => (
                <SelectItem key={model} value={model} className="focus:bg-secondary/30 cursor-pointer">
                  {model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Add New Models */}
        <div className="pt-4 border-t border-border">
          <Label className="text-foreground text-sm font-medium">Add New Models</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {settings.openai.supportedModels.map((model) => (
              <Badge
                key={model}
                className="bg-secondary/50 text-foreground border border-border flex items-center gap-1 px-2 py-1"
                variant="outline"
              >
                {model}
                <button
                  className="hover:bg-destructive/20 ml-1 rounded-full"
                  onClick={() => handleRemoveModel(model)}
                >
                  <X size={14} />
                </button>
              </Badge>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <div className="relative flex-1">
              <Input
                id="new-model"
                name="new-model"
                placeholder="Add a new model ID"
                className="w-full rounded-md border-input bg-background px-3 py-2 text-sm"
                value={newModelInput}
                onChange={(e) => setNewModelInput(e.target.value)}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => {
                  // Allow time for click events before closing dropdown
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
                <ul
                  className="
                    absolute z-10 mt-1 w-full
                    bg-background
                    rounded-md shadow-sm
                    max-h-40 overflow-auto
                    py-1
                  "
                >
                  {filteredModels.length > 0 ? (
                    filteredModels.map((model) => (
                      <li
                        key={model}
                        onMouseDown={() => {
                          handleAddModel(model);
                          setNewModelInput("");
                        }}
                        className="
                          relative flex items-center px-3 py-2
                          text-sm select-none cursor-pointer
                          hover:bg-secondary/30 transition-colors duration-100 rounded-2xl
                        "
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
              className="bg-primary hover:bg-primary/90"
            >
              Add
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
} 