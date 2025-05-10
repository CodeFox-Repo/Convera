import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { AppSettings } from "@/types/settings";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OFFICIAL_MODELS, fetchOpenRouterModels } from "@/constants/officialModels";

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

  // Filter models based on input text and exclude already added models
  const filteredModels = officialModels.filter(
    (m) =>
      m.toLowerCase().includes(newModelInput.toLowerCase()) &&
      !settings.openai.supportedModels.includes(m)
  );

  // Get list of models that aren't already added
  const getAvailableModels = () => {
    return officialModels.filter(
      (m) => !settings.openai.supportedModels.includes(m)
    );
  };

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

  // Available models list
  const availableModels = getAvailableModels();

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
                <ul className="absolute z-10 mt-1 w-full bg-background border rounded shadow max-h-40 overflow-auto">
                  {newModelInput
                    ? filteredModels.map((model) => (
                        <li
                          key={model}
                          className="px-3 py-2 cursor-pointer hover:bg-primary/10 text-xs"
                          onClick={() => {
                            handleAddModel(model);
                            setNewModelInput("");
                          }}
                        >
                          {model}
                        </li>
                      ))
                    : availableModels.map((model) => (
                        <li
                          key={model}
                          className="px-3 py-2 cursor-pointer hover:bg-primary/10 text-xs"
                          onClick={() => {
                            handleAddModel(model);
                            setNewModelInput("");
                          }}
                        >
                          {model}
                        </li>
                      ))}
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