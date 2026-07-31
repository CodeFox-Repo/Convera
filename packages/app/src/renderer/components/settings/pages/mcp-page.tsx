import { Button } from "@/renderer/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/renderer/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/renderer/components/ui/dropdown-menu";
import { useMcpStore } from "@/renderer/libs/stores/mcp-store";
import { ConnectionStatus } from "@/shared/types/mcp";
import {
  FileText,
  FolderOpen,
  Loader2,
  Plus,
  RefreshCw,
  Server,
  Settings,
  Trash2,
} from "lucide-react";
import React, { useEffect, useState } from "react";

const MCP_CONFIG_FOLDER_PATH = "~/.convera";
const MCP_CONFIG_FILE_PATH = "~/.convera/mcp.json";

export function McpSettingsPage() {
  const {
    mcpServers,
    loadingMcpServers,
    handleManualInstallMcp,
    handleMcpConfigChange,
    handleRemoveServer,
    refreshAll: refreshMcpData,
    subscribeMcpChanges,
  } = useMcpStore();

  const [showManualConfigDialog, setShowManualConfigDialog] = useState(false);
  const [manualConfig, setManualConfig] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [removingServers, setRemovingServers] = useState<Set<string>>(
    new Set(),
  );
  const [restartingServers, setRestartingServers] = useState<Set<string>>(
    new Set(),
  );
  const [updatingServers, setUpdatingServers] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    const mcpStore = useMcpStore.getState();
    mcpStore.refreshAll();

    // Subscribe to MCP data changes for real-time sync
    const unsubscribe = subscribeMcpChanges();

    return () => {
      unsubscribe();
    };
  }, [subscribeMcpChanges]);

  const handleOpenManualDialog = () => {
    setShowManualConfigDialog(true);
    setManualConfig("");
  };

  const handleOpenMCPConfigFolder = async () => {
    await window.electronAPI.openPath(MCP_CONFIG_FOLDER_PATH);
  };

  const handleOpenMCPConfigFile = async () => {
    await window.electronAPI.openPath(MCP_CONFIG_FILE_PATH);
  };

  const handleSubmitManualConfig = async () => {
    if (!manualConfig.trim()) return;

    setIsSubmitting(true);
    try {
      await handleManualInstallMcp(manualConfig);
      setShowManualConfigDialog(false);
      setManualConfig("");
    } catch (error) {
      console.error("Failed to install MCP:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveServerClick = async (serverId: string) => {
    if (!window.confirm("Are you sure you want to remove this server?")) {
      return;
    }

    setRemovingServers((prev) => new Set([...prev, serverId]));
    try {
      await handleRemoveServer(serverId);
    } catch (error) {
      console.error("Failed to remove server:", error);
    } finally {
      setRemovingServers((prev) => {
        const newSet = new Set(prev);
        newSet.delete(serverId);
        return newSet;
      });
    }
  };

  const handleRestartServer = async (serverId: string) => {
    setRestartingServers((prev) => new Set([...prev, serverId]));
    try {
      const response = await window.mcpAPI.startServer(serverId);
      if (!response.success) {
        throw new Error(response.error || "Failed to restart server");
      }
      await refreshMcpData();
    } catch (error) {
      console.error("Failed to restart server:", error);
    } finally {
      setRestartingServers((prev) => {
        const newSet = new Set(prev);
        newSet.delete(serverId);
        return newSet;
      });
    }
  };

  const handleManagedServerToggle = async (
    serverId: string,
    disabled: boolean,
  ) => {
    setUpdatingServers((prev) => new Set([...prev, serverId]));
    try {
      await handleMcpConfigChange(serverId, "disabled", disabled);
    } finally {
      setUpdatingServers((prev) => {
        const newSet = new Set(prev);
        newSet.delete(serverId);
        return newSet;
      });
    }
  };

  const StatusIndicator = ({ status }: { status: string }) => {
    const getStatusConfig = () => {
      switch (status) {
        case ConnectionStatus.CONNECTED:
          return {
            color: "bg-green-500",
            glow: "shadow-green-500/50 shadow-lg animate-pulse",
          };
        case ConnectionStatus.CONNECTING:
          return {
            color: "bg-yellow-500",
            glow: "shadow-yellow-500/50 shadow-lg animate-pulse",
          };
        case ConnectionStatus.DISABLED:
          return {
            color: "bg-muted-foreground",
            glow: "",
          };
        case ConnectionStatus.UNAUTHORIZED:
          return {
            color: "bg-orange-500",
            glow: "shadow-orange-500/50 shadow-lg animate-pulse",
          };
        case ConnectionStatus.ERROR:
        case ConnectionStatus.DISCONNECTED:
        default:
          return {
            color: "bg-red-500",
            glow: "shadow-red-500/50 shadow-lg animate-pulse",
          };
      }
    };

    const config = getStatusConfig();

    return (
      <div className="flex items-center justify-center w-6 h-6">
        <div
          className={`w-3 h-3 rounded-full ${config.color} ${config.glow}`}
        />
      </div>
    );
  };

  return (
    <div className="p-6">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground mb-2">
              MCP Servers
            </h1>
            <p className="text-muted-foreground">
              Manage your MCP (Model Context Protocol) servers to extend AI
              capabilities
            </p>
          </div>
          <Button
            onClick={handleOpenManualDialog}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Server
          </Button>
        </div>

        {/* Server Management */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-foreground">
              Installed Servers
            </h2>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings className="h-4 w-4 mr-2" />
                  Config Files
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleOpenMCPConfigFolder}>
                  <FolderOpen className="mr-2 h-4 w-4" />
                  Open Config Folder
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleOpenMCPConfigFile}>
                  <FileText className="mr-2 h-4 w-4" />
                  Open Config File
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {loadingMcpServers ? (
            <div className="p-4 border border-border rounded-lg">
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mr-3" />
                <span className="text-muted-foreground">
                  Loading MCP servers...
                </span>
              </div>
            </div>
          ) : mcpServers.length === 0 ? (
            <div className="p-4 border border-border rounded-lg">
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                  <Server className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="font-medium text-foreground mb-1">
                  No MCP Servers Yet
                </h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Add your first MCP server to extend your AI assistant&apos;s
                  capabilities
                </p>
                <Button onClick={handleOpenManualDialog}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Server
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {mcpServers.map((server) => {
                const isRestarting = restartingServers.has(server.name);
                return (
                  <div
                    key={server.name}
                    className="p-4 border border-border rounded-lg hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <StatusIndicator status={server.status} />
                        <div className="flex-1">
                          <h3 className="font-medium text-foreground mb-1">
                            {server.displayName || server.name}
                          </h3>
                          {server.description && (
                            <p className="text-sm text-muted-foreground">
                              {server.description}
                            </p>
                          )}
                          {server.error && (
                            <p className="text-sm text-red-600">
                              {server.error}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {server.managed && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={updatingServers.has(server.name)}
                            onClick={() =>
                              handleManagedServerToggle(
                                server.name,
                                server.status !== ConnectionStatus.DISABLED,
                              )
                            }
                          >
                            {updatingServers.has(server.name)
                              ? "Updating"
                              : server.status === ConnectionStatus.DISABLED
                                ? "Enable"
                                : "Disable"}
                          </Button>
                        )}
                        {(server.status === ConnectionStatus.ERROR ||
                          server.status === ConnectionStatus.DISCONNECTED) &&
                          !isRestarting && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRestartServer(server.name)}
                            >
                              <RefreshCw className="h-4 w-4 mr-1" />
                              Restart
                            </Button>
                          )}
                        {isRestarting && (
                          <Button variant="outline" size="sm" disabled>
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            Restarting
                          </Button>
                        )}
                        {!server.managed && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveServerClick(server.name)}
                            disabled={removingServers.has(server.name)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            {removingServers.has(server.name) ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add Server Dialog */}
      <Dialog
        open={showManualConfigDialog}
        onOpenChange={setShowManualConfigDialog}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Add MCP Server
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Server Configuration (JSON)
              </label>
              <textarea
                className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-64 w-full rounded-md border bg-transparent px-3 py-2 font-mono text-sm outline-none focus-visible:ring-[3px]"
                value={manualConfig}
                onChange={(e) => setManualConfig(e.target.value)}
                placeholder={`{
  "mcpServers": {
    "example-server": {
      "command": "node",
      "args": ["path/to/server.js"],
      "env": {}
    }
  }
}`}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" className="text-foreground">
                Cancel
              </Button>
            </DialogClose>
            <Button
              onClick={handleSubmitManualConfig}
              disabled={!manualConfig.trim() || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add Server"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
