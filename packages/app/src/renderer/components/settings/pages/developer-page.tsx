import { Badge } from "@/renderer/components/ui/badge";
import { Button } from "@/renderer/components/ui/button";
import { Switch } from "@/renderer/components/ui/switch";
import { useSettingsStore } from "@/renderer/libs/stores/settings-store";
import { useSelectionStore } from "@/renderer/libs/db/ui-state";
import { resolveNativeProviderSelection } from "@/renderer/libs/provider-selection";
import type {
  LocalAIConversationRuntimeState,
  LocalAIMemoryStatus,
} from "@/shared/types/local-ai";
import {
  AlertTriangle,
  AppWindowIcon,
  Code2,
  FlaskConical,
  Layers,
  Monitor,
  MousePointer,
  RefreshCw,
  Terminal,
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";

interface WindowControlCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  onToggle: (e?: React.MouseEvent<HTMLButtonElement>) => void;
  badge?: string;
}

const WindowControlCard = ({
  title,
  description,
  icon,
  onToggle,
  badge,
}: WindowControlCardProps) => (
  <div className="group relative overflow-hidden border border-border/30 rounded-lg p-4 hover:border-primary/30 transition-all duration-200 bg-card">
    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
    <div className="relative space-y-3">
      <div className="flex items-start justify-between">
        <div className="p-2 bg-muted rounded-lg">{icon}</div>
        {badge && (
          <Badge variant="outline" className="text-xs">
            {badge}
          </Badge>
        )}
      </div>
      <div>
        <h3 className="font-medium text-sm text-foreground mb-1">{title}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {description}
        </p>
      </div>
      <Button
        onClick={onToggle}
        size="sm"
        variant="secondary"
        className="w-full"
      >
        Toggle {title}
      </Button>
    </div>
  </div>
);

const FeatureToggle = ({
  title,
  description,
  enabled,
  onToggle,
  icon,
  warning,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  icon?: React.ReactNode;
  warning?: string;
}) => (
  <div className="p-4 border border-border/30 rounded-lg hover:border-border/50 transition-colors">
    <div className="flex items-center justify-between">
      <div className="flex items-start gap-3">
        {icon && <div className="p-2 bg-muted rounded-lg mt-0.5">{icon}</div>}
        <div className="space-y-1">
          <h3 className="font-medium text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
          {warning && (
            <div className="flex items-center gap-2 mt-2">
              <AlertTriangle className="h-3 w-3 text-yellow-600 dark:text-yellow-500" />
              <p className="text-xs text-yellow-600 dark:text-yellow-500">
                {warning}
              </p>
            </div>
          )}
        </div>
      </div>
      <Switch checked={enabled} onCheckedChange={onToggle} className="ml-4" />
    </div>
  </div>
);

export function DeveloperSettingsPage() {
  const {
    devModeEnabled,
    experimentalFeatures,
    setDevModeEnabled,
    setExperimentalFeature,
  } = useSettingsStore();
  const { currentConversationId, selectedConfigId } = useSelectionStore();
  const selectedProviderId = resolveNativeProviderSelection(
    selectedConfigId,
    undefined,
  ).configId;
  const [runtimeState, setRuntimeState] =
    useState<LocalAIConversationRuntimeState | null>(null);
  const [memoryStatus, setMemoryStatus] = useState<LocalAIMemoryStatus | null>(
    null,
  );
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(false);

  const refreshRuntimeState = useCallback(async () => {
    setRuntimeLoading(true);
    setRuntimeError(null);
    try {
      const [runtimeResult, memoryResult] = await Promise.all([
        currentConversationId
          ? window.localAI.getConversationRuntimeState(currentConversationId)
          : Promise.resolve({
              success: true as const,
              data: null,
              error: undefined,
            }),
        window.localAI.getMemoryStatus(currentConversationId ?? undefined),
      ]);
      if (!runtimeResult.success) {
        throw new Error(
          runtimeResult.error?.message || "Could not read runtime state.",
        );
      }
      setRuntimeState(runtimeResult.data ?? null);
      if (!memoryResult.success || !memoryResult.data) {
        throw new Error(
          memoryResult.error?.message || "Could not read memory status.",
        );
      }
      setMemoryStatus(memoryResult.data);
    } catch (error) {
      setRuntimeError(
        error instanceof Error
          ? error.message
          : "Could not read runtime state.",
      );
    } finally {
      setRuntimeLoading(false);
    }
  }, [currentConversationId]);

  useEffect(() => {
    void refreshRuntimeState();
  }, [refreshRuntimeState]);

  const resetProviderSession = useCallback(async () => {
    if (!currentConversationId) return;
    setRuntimeLoading(true);
    setRuntimeError(null);
    try {
      const result = await window.localAI.resetConversationProviderSession({
        conversationId: currentConversationId,
        providerId: selectedProviderId,
      });
      if (!result.success || !result.data) {
        throw new Error(
          result.error?.message || "Could not reset provider session.",
        );
      }
      setRuntimeState(result.data);
    } catch (error) {
      setRuntimeError(
        error instanceof Error
          ? error.message
          : "Could not reset provider session.",
      );
    } finally {
      setRuntimeLoading(false);
    }
  }, [currentConversationId, selectedProviderId]);

  const windowControls = [
    {
      id: "agent",
      title: "Agent Popover",
      description: "Agent selection (embedded)",
      icon: <MousePointer className="h-4 w-4 text-muted-foreground" />,
      onToggle: () => {
        // Dispatch event to toggle agent popover visibility
        window.dispatchEvent(new CustomEvent("toggle-agent-popover"));
      },
      badge: "Embedded",
    },
    {
      id: "model",
      title: "Model Selector",
      description: "Model selection (embedded)",
      icon: <Layers className="h-4 w-4 text-muted-foreground" />,
      onToggle: () => {
        // Dispatch event to toggle model selector visibility
        window.dispatchEvent(new CustomEvent("toggle-model-selector"));
      },
      badge: "Embedded",
    },
  ];

  return (
    <div className="p-6">
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-foreground mb-2">
            Developer Settings
          </h1>
          <p className="text-muted-foreground">
            Development tools and experimental features
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium text-foreground">
                Conversation Runtime
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Inspect the selected conversation without exposing native
                provider session identifiers.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={runtimeLoading}
              onClick={() => void refreshRuntimeState()}
            >
              <RefreshCw
                className={`h-4 w-4 ${runtimeLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>

          <div className="border border-border rounded-lg divide-y divide-border">
            <div className="flex items-center justify-between gap-4 p-4">
              <span className="text-sm text-muted-foreground">
                Conversation
              </span>
              <span className="max-w-80 truncate font-mono text-xs text-foreground">
                {currentConversationId ?? "No conversation selected"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 p-4 md:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Revision</p>
                <p className="font-mono text-sm text-foreground">
                  {runtimeState?.revision ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Memory epoch</p>
                <p className="font-mono text-sm text-foreground">
                  {runtimeState?.memoryEpoch ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Memory version</p>
                <p className="font-mono text-sm text-foreground">
                  {runtimeState?.memoryVersion ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Memory jobs</p>
                <p className="font-mono text-sm text-foreground">
                  {memoryStatus
                    ? `${memoryStatus.pendingJobs}/${memoryStatus.failedJobs}`
                    : "—"}
                </p>
              </div>
            </div>
            <div className="space-y-2 p-4">
              {runtimeState?.providers.length ? (
                runtimeState.providers.map((provider) => (
                  <div
                    key={provider.providerId}
                    className="flex items-center justify-between gap-4 text-sm"
                  >
                    <span className="text-foreground">
                      {provider.providerId}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      revision {provider.revision}
                      {provider.stale ? " · stale" : " · current"}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No provider binding for this conversation.
                </p>
              )}
            </div>
            <div className="flex items-center justify-between gap-4 p-4">
              <p className="text-xs text-muted-foreground">
                {runtimeError ||
                  memoryStatus?.detail ||
                  "Reset creates a clean native session on the next turn."}
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={!currentConversationId || runtimeLoading}
                onClick={() => void resetProviderSession()}
              >
                Reset {selectedProviderId}
              </Button>
            </div>
          </div>
        </div>

        {/* Experimental Features Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-medium text-foreground">
              Experimental Features
            </h2>
          </div>

          <div className="p-3 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800/30 rounded-lg mb-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-200 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>
                Experimental features are in active development and may change,
                break, or be removed without notice
              </span>
            </p>
          </div>

          <FeatureToggle
            title="Enable Main Window"
            description="Show button in chat input to toggle between main and chat views"
            enabled={experimentalFeatures.enableMainWindow}
            onToggle={() =>
              setExperimentalFeature(
                "enableMainWindow",
                !experimentalFeatures.enableMainWindow,
              )
            }
            icon={<AppWindowIcon className="h-4 w-4 text-muted-foreground" />}
            warning="This feature may affect UI stability"
          />
        </div>

        {/* Developer Mode Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-medium text-foreground">
              Developer Mode
            </h2>
          </div>

          <FeatureToggle
            title="Enable Developer Mode"
            description="Unlock debugging tools and window controls for development"
            enabled={devModeEnabled}
            onToggle={() => setDevModeEnabled(!devModeEnabled)}
            icon={<Code2 className="h-4 w-4 text-muted-foreground" />}
          />

          {/* Window Controls - Only show when dev mode is enabled */}
          {devModeEnabled && (
            <div className="ml-4 space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <Monitor className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-medium text-foreground">Window Controls</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {windowControls.map((control) => (
                  <WindowControlCard
                    key={control.id}
                    title={control.title}
                    description={control.description}
                    icon={control.icon}
                    onToggle={control.onToggle}
                    badge={control.badge}
                  />
                ))}
              </div>
              <div className="p-3 bg-muted/30 border border-border/20 rounded-lg">
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <AlertTriangle className="h-3 w-3" />
                  These controls are for development and debugging purposes only
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
