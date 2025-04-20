import React from "react";
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
          <Input
            id="modelId"
            value={settings.openai.modelId}
            onChange={(e) => onOpenAIChange("modelId", e.target.value)}
            placeholder="gpt-4o"
            className="border-input bg-background text-foreground"
          />
        </div>

        {/* Supported Models list */}
        <div className="mt-6">
          <Label>Supported Models</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {settings.openai.supportedModels.map((model) => (
              <Badge
                key={model}
                className="bg-primary/20 text-primary flex items-center gap-1"
              >
                {model}
                <button
                  className="hover:bg-destructive/20 ml-1 rounded-full"
                  onClick={() => onRemoveSupportedModel(model)}
                >
                  <X size={14} />
                </button>
              </Badge>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Input
              id="new-model"
              name="new-model"
              placeholder="Add a new model ID"
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onAddSupportedModel((e.target as HTMLInputElement).value);
                  (e.target as HTMLInputElement).value = "";
                }
              }}
            />
            <Button
              onClick={() => {
                const input = document.getElementById(
                  "new-model"
                ) as HTMLInputElement;
                onAddSupportedModel(input.value);
                input.value = "";
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