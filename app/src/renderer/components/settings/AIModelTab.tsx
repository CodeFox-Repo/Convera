import React, { useState, useEffect, useMemo } from "react";

import { X } from "lucide-react";
import { AppSettings } from "@/shared/types/settings";

import { OFFICIAL_MODELS, fetchOpenRouterModels } from "@/shared/constants/officialModels";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

type AIModelTabProps = {
  settings: AppSettings;
  onOpenAIChange: (field: string, value: string) => void;
  onAddSupportedModel: (model: string) => void;
  onRemoveSupportedModel: (model: string) => void;
};

export function AIModelTab({
  settings,
  onOpenAIChange,
  onAddSupportedModel,
  onRemoveSupportedModel,
}: AIModelTabProps) {
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
   * Memoize uFuzzy instance and dynamic import
   */
  const fuzzyInstance = useMemo(() => {
    let fuzzy: unknown = null;
    let loaded = false;
    let loadingPromise: Promise<unknown> | null = null;
    const load = async (): Promise<{ search: (haystack: string[], needle: string) => [number[], { idx: number[] }, number[]] }> => {
      if (loaded) return fuzzy as { search: (haystack: string[], needle: string) => [number[], { idx: number[] }, number[]] };
      if (loadingPromise) return loadingPromise as Promise<{ search: (haystack: string[], needle: string) => [number[], { idx: number[] }, number[]] }>;
      loadingPromise = import('@leeoniya/ufuzzy').then((module) => {
        const uFuzzy = module.default;
        fuzzy = new uFuzzy({
          intraMode: 1,
          intraIns: 1,
          intraSub: 1,
          intraTrn: 1,
          intraDel: 1,
          interLft: 1,
          interRgt: 0,
          intraChars: "[w-.]",
          interChars: "[s-_.//]",
        });
        loaded = true;
        return fuzzy as { search: (haystack: string[], needle: string) => [number[], { idx: number[] }, number[]] };
      });
      return loadingPromise as Promise<{ search: (haystack: string[], needle: string) => [number[], { idx: number[] }, number[]] }>;
    };
    return { load };
  }, [availableModels]);

  /**
   * Perform fuzzy and fallback search for models
   */
  const searchModels = async (input: string, models: string[], setResult: (models: string[]) => void) => {
    const normalizedInput = input.toLowerCase();
    if (!normalizedInput.trim()) {
      setResult(models);
      return;
    }
    try {
      const fuzzy = await fuzzyInstance.load();
      const result: [number[], { idx: number[] }, number[]] = fuzzy.search(models, normalizedInput);
      if (result && result.length > 0) {
        const info = result[1];
        const order = result[2];
        if (info && order && info.idx) {
          const matches = order.map((i: number) => models[info.idx[i]]);
          if (matches.length > 0) {
            setResult(matches);
            return;
          }
        }
      }
      fallbackSearch(normalizedInput, models, setResult);
    } catch {
      fallbackSearch(normalizedInput, models, setResult);
    }
  };

  /**
   * Fallback search: prefix, substring, and normalized (remove separators) matching
   */
  const fallbackSearch = (input: string, models: string[], setResult: (models: string[]) => void) => {
    const prefixMatches = models.filter(model => {
      const modelWords = model.toLowerCase().split(/[\s\-_./]+/);
      return modelWords.some(word => word.startsWith(input));
    });
    if (prefixMatches.length > 0) {
      setResult(prefixMatches);
      return;
    }
    const substringMatches = models.filter(model => model.toLowerCase().includes(input));
    if (substringMatches.length > 0) {
      setResult(substringMatches);
      return;
    }
    const normalize = (str: string) => str.replace(/[\s\-_./]/g, "");
    const normalizedInputNoSep = normalize(input);
    const noSepMatches = models.filter(model => normalize(model.toLowerCase()).includes(normalizedInputNoSep));
    setResult(noSepMatches);
  };

  useEffect(() => {
    searchModels(newModelInput, availableModels, setFilteredModels);
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
    <Card className="bg-card text-foreground border-none">
      <CardHeader>
        <CardTitle>AI Model Settings</CardTitle>
        <CardDescription className="text-muted-foreground">
          Configure your AI API settings
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
            <SelectTrigger className="border-input bg-background text-foreground w-full">
              <SelectValue placeholder="Select a model">
                {settings.openai.modelId}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="w-full">
              {settings.openai.supportedModels.map((model) => (
                <SelectItem key={model} value={model}>
                  {model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Add New Models */}
        <div>
          <Label>Add New Models</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {settings.openai.supportedModels.map((model) => (
              <Badge
                key={model}
                className="bg-primary/20 text-primary flex items-center gap-1"
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
              <input
                id="new-model"
                name="new-model"
                placeholder="Add a new model ID"
                className="w-full border px-2 py-1 rounded"
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
                    bg-popover  /* same background as SelectContent */
                    border border-input  /* same border */
                  rounded-md shadow-lg
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
                          text-sm select-none cursor-pointer rounded-sm
                          /* exactly like SelectItem */
                          radix-highlighted:bg-accent
                          radix-highlighted:text-accent-foreground
                          /* fallback highlight on hover */
                          hover:bg-accent hover:text-accent-foreground
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
            >
              Add
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 