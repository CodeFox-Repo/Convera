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
   * Initialize fuzzy search and update filtered models when input changes
   */
  useEffect(() => {
    const performSearch = async () => {
      try {
        // Dynamically import uFuzzy
        const module = await import('@leeoniya/ufuzzy');
        const uFuzzy = module.default;
        
        // Create fuzzy search instance with optimized settings for model search
        const fuzzy = new uFuzzy({
          intraMode: 1,          // SingleError mode - allows one error within terms
          intraIns: 1,           // Allow insertions 
          intraSub: 1,           // Allow substitutions
          intraTrn: 1,           // Allow transpositions
          intraDel: 1,           // Allow deletions
          interLft: 1,           // Loose left boundary - better for prefix matching
          interRgt: 0,           // Any right boundary - allows matching within words
          intraChars: "[\\w\\-\\.]", // Allow alphanumeric, hyphen, and dot as intra-term chars
          interChars: "[\\s\\-_\\./]", // Define separators between terms
        });
        
        // If input is empty, show all available models
        if (!newModelInput.trim()) {
          setFilteredModels(availableModels);
          return;
        }
        
        const input = newModelInput.toLowerCase();
        
        // Use uFuzzy to search
        const result = fuzzy.search(availableModels, input);
        
        if (result && result.length > 0) {
          // Destructure with type checking
          const idxs = result[0];
          const info = result[1];
          const order = result[2];
          
          // Make sure all required parts exist
          if (info && order && info.idx) {
            // Get the matched models in sorted order
            const matches = order.map(i => availableModels[info.idx[i]]);
            setFilteredModels(matches);
            return; // Exit if we found matches
          }
        }
        
        // If we get here, uFuzzy didn't find good matches, use our custom search
        fallbackSearch();
      } catch (error) {
        console.error("Error with fuzzy search:", error);
        // Fallback to simple filtering if uFuzzy fails
        fallbackSearch();
      }
    };
    
    // Custom fallback search with prefix matching
    const fallbackSearch = () => {
      const input = newModelInput.toLowerCase();
      
      // First try prefix matching (higher priority)
      const prefixMatches = availableModels.filter(model => {
        // Check if any word in the model starts with the input
        const modelWords = model.toLowerCase().split(/[\s-_./]+/);
        return modelWords.some(word => word.startsWith(input));
      });
      
      // If we have prefix matches, use those
      if (prefixMatches.length > 0) {
        setFilteredModels(prefixMatches);
        return;
      }
      
      // Otherwise fall back to substring matching
      const substringMatches = availableModels.filter(
        model => model.toLowerCase().includes(input)
      );
      setFilteredModels(substringMatches);
    };
    
    performSearch();
  }, [newModelInput, availableModels]);

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