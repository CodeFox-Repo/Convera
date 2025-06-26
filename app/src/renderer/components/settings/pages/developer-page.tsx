import { useSettingsStore } from "@/renderer/libs/stores/settings-store";
import React from "react";

export function DeveloperSettingsPage() {
  const {
    devModeEnabled,
    experimentalFeatures,
    setDevModeEnabled,
    setExperimentalFeature,
  } = useSettingsStore();

  return (
    <div className="p-6 space-y-6">
      {/* Developer Mode Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            Developer Settings
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Development tools and debugging features
          </p>
        </div>

        <div className="border border-border rounded-lg">
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-foreground">Developer Mode</h3>
                <p className="text-sm text-muted-foreground">
                  Enable debugging tools and window controls
                </p>
              </div>
              <button
                onClick={() => setDevModeEnabled(!devModeEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  devModeEnabled ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    devModeEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>

          {devModeEnabled && (
            <div className="p-4 space-y-4">
              <div>
                <h4 className="font-medium text-foreground mb-3">
                  Window Controls
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="border border-border rounded-md p-3">
                    <h5 className="font-medium text-sm mb-1">
                      Settings Window
                    </h5>
                    <p className="text-xs text-muted-foreground mb-2">
                      Configuration window
                    </p>
                    <button
                      onClick={() =>
                        window.electronAPI?.toggleWindow("settings")
                      }
                      className="w-full px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground text-sm rounded-md transition-colors"
                    >
                      Toggle Settings
                    </button>
                  </div>

                  <div className="border border-border rounded-md p-3">
                    <h5 className="font-medium text-sm mb-1">History Window</h5>
                    <p className="text-xs text-muted-foreground mb-2">
                      Chat history browser
                    </p>
                    <button
                      onClick={() =>
                        window.electronAPI?.toggleWindow("history")
                      }
                      className="w-full px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground text-sm rounded-md transition-colors"
                    >
                      Toggle History
                    </button>
                  </div>

                  <div className="border border-border rounded-md p-3">
                    <h5 className="font-medium text-sm mb-1">Agent Popover</h5>
                    <p className="text-xs text-muted-foreground mb-2">
                      Agent selection popover
                    </p>
                    <button
                      onClick={(e) => {
                        const button = e.currentTarget;
                        const rect = button.getBoundingClientRect();
                        const x = rect.right + 10;
                        const y = rect.top;

                        window.electronAPI?.toggleAgentPopover(
                          Math.round(x),
                          Math.round(y),
                          280,
                          200,
                        );
                      }}
                      className="w-full px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground text-sm rounded-md transition-colors"
                    >
                      Toggle Agent Popover
                    </button>
                  </div>

                  <div className="border border-border rounded-md p-3">
                    <h5 className="font-medium text-sm mb-1">Model Selector</h5>
                    <p className="text-xs text-muted-foreground mb-2">
                      Model selection popover
                    </p>
                    <button
                      onClick={(e) => {
                        const button = e.currentTarget;
                        const rect = button.getBoundingClientRect();
                        const x = rect.right + 10;
                        const y = rect.top;

                        window.electronAPI?.toggleModelSelector(
                          Math.round(x),
                          Math.round(y),
                          280,
                          200,
                        );
                      }}
                      className="w-full px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground text-sm rounded-md transition-colors"
                    >
                      Toggle Model Selector
                    </button>
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">
                  These controls are for development and debugging purposes.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Experimental Features Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            Experimental Features
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Features in development that may change or be removed
          </p>
        </div>

        <div className="border border-border rounded-lg">
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-foreground">
                  Enable Main Window
                </h3>
                <p className="text-sm text-muted-foreground">
                  Show button in chat input to toggle between main and chat
                  views
                </p>
              </div>
              <button
                onClick={() =>
                  setExperimentalFeature(
                    "enableMainWindow",
                    !experimentalFeatures.enableMainWindow,
                  )
                }
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  experimentalFeatures.enableMainWindow
                    ? "bg-primary"
                    : "bg-muted"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    experimentalFeatures.enableMainWindow
                      ? "translate-x-6"
                      : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
