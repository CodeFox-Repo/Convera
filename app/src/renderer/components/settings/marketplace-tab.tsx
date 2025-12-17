import { MCPConfig, ServerInfo } from "@/shared/types/mcp";
import {
  AlertCircle,
  FileText,
  FolderOpen,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import React, { useState } from "react";
import { Alert, AlertDescription } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

type MarketplaceSectionProps = {
  mcpServers: ServerInfo[];
  loadingMcpServers: boolean;
  onManualInstallMcp?: (configJson: string) => Promise<void>;
  onRemoveServer?: (serverId: string) => Promise<void>;
  onRefreshServers?: () => void;
};

const MCP_CONFIG_FOLDER_PATH = "~/.convera";
const MCP_CONFIG_FILE_PATH = "~/.convera/mcp.json";

export function MarketplaceSection({
  mcpServers,
  loadingMcpServers,
  onManualInstallMcp,
  onRemoveServer,
  onRefreshServers,
}: MarketplaceSectionProps) {
  const [showManualConfigDialog, setShowManualConfigDialog] = useState(false);
  const [manualConfig, setManualConfig] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [removingServers, setRemovingServers] = useState<
    Record<string, boolean>
  >({});
  const [manualConfigError, setManualConfigError] = useState<string | null>(
    null,
  );

  const handleSubmitManualConfig = async () => {
    if (!manualConfig.trim() || !onManualInstallMcp) return;

    setIsSubmitting(true);
    setManualConfigError(null);
    try {
      // Parse and validate the JSON configuration
      let config: MCPConfig;
      try {
        config = JSON.parse(manualConfig);
      } catch {
        throw new Error("Invalid JSON format");
      }

      if (!config.mcpServers || typeof config.mcpServers !== "object") {
        throw new Error("Invalid configuration: missing 'mcpServers' object");
      }

      await onManualInstallMcp(manualConfig);
      setShowManualConfigDialog(false);
      setManualConfig("");
      setManualConfigError(null);

      // Refresh server list after installation
      if (onRefreshServers) {
        onRefreshServers();
      }
    } catch (error) {
      console.error("Error submitting manual config:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      setManualConfigError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenManualDialog = () => {
    setManualConfig("");
    setManualConfigError(null);
    setShowManualConfigDialog(true);
  };

  const handleRemoveServer = async (serverId: string) => {
    if (!onRemoveServer) return;

    setRemovingServers((prev) => ({ ...prev, [serverId]: true }));
    try {
      await onRemoveServer(serverId);
      // Refresh server list after removal
      if (onRefreshServers) {
        onRefreshServers();
      }
    } catch (error) {
      console.error(`Error removing server ${serverId}:`, error);
    } finally {
      setRemovingServers((prev) => ({ ...prev, [serverId]: false }));
    }
  };

  const handleOpenMCPConfigFolder = async () => {
    await window.electronAPI.openPath(MCP_CONFIG_FOLDER_PATH);
  };

  const handleOpenMCPConfigFile = async () => {
    await window.electronAPI.openPath(MCP_CONFIG_FILE_PATH);
  };

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground mb-2">
              MCP Servers
            </h1>
            <p className="text-muted-foreground">
              Manage your MCP (Model Context Protocol) servers
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenManualDialog}
            className="bg-primary/10 hover:bg-primary/20 border-primary/30 text-primary dark:bg-primary/10 dark:hover:bg-primary/20 dark:border-primary/30 dark:text-primary flex items-center gap-2 transition-all duration-200"
          >
            <Plus className="h-4 w-4" />
            Add Server
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-foreground text-xl font-semibold">
              Installed MCP Servers
            </h3>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-gray-50 hover:bg-gray-100 border-gray-300 text-gray-700 dark:bg-gray-800/50 dark:hover:bg-gray-700/50 dark:border-gray-600 dark:text-gray-300 flex items-center gap-2 transition-all duration-200"
                >
                  <FileText className="h-4 w-4" />
                  Edit MCP Config
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-lg"
              >
                <DropdownMenuItem
                  onClick={handleOpenMCPConfigFolder}
                  className="hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 cursor-pointer transition-colors duration-150"
                >
                  <FolderOpen className="mr-2 h-4 w-4 text-blue-600 dark:text-blue-400" />
                  Open Config Folder
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleOpenMCPConfigFile}
                  className="hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 cursor-pointer transition-colors duration-150"
                >
                  <FileText className="mr-2 h-4 w-4 text-green-600 dark:text-green-400" />
                  Open Config File
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="space-y-4">
            {loadingMcpServers ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
              </div>
            ) : mcpServers.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">
                  No MCP servers configured yet
                </p>
                <Button
                  variant="outline"
                  onClick={handleOpenManualDialog}
                  className="bg-primary/10 hover:bg-primary/20 border-primary/30 text-primary"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Server
                </Button>
              </div>
            ) : (
              <div className="flex flex-col space-y-4">
                {mcpServers.map((server) => (
                  <div
                    key={server.name}
                    className="border-l-4 border-l-green-500 border-b border-border pb-4 last:border-b-0 hover:bg-secondary/10 transition-all duration-200 pl-3 group relative"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-foreground font-semibold">
                              {server.displayName || server.name}
                            </h4>
                            <Badge
                              className={
                                server.status === "connected"
                                  ? "border-green-600/20 bg-green-600/10 text-green-600 dark:bg-green-900/20 dark:text-green-400"
                                  : server.status === "connecting"
                                    ? "border-yellow-600/20 bg-yellow-600/10 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400"
                                    : "border-red-600/20 bg-red-600/10 text-red-600 dark:bg-red-900/20 dark:text-red-400"
                              }
                            >
                              {server.status === "connected"
                                ? "Connected"
                                : server.status === "connecting"
                                  ? "Connecting"
                                  : "Disconnected"}
                            </Badge>
                            <Badge className="border-blue-600/20 bg-blue-600/10 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                              {server.transportType}
                            </Badge>
                          </div>

                          <p className="text-muted-foreground line-clamp-1 text-sm mt-1">
                            {server.description || "No description available"}
                          </p>

                          {server.error && (
                            <p className="text-red-600 dark:text-red-400 text-xs mt-1">
                              Error: {server.error}
                            </p>
                          )}

                          {server.capabilities && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {server.capabilities.tools?.length > 0 && (
                                <Badge variant="outline" className="text-xs">
                                  {server.capabilities.tools.length} tools
                                </Badge>
                              )}
                              {server.capabilities.resources?.length > 0 && (
                                <Badge variant="outline" className="text-xs">
                                  {server.capabilities.resources.length}{" "}
                                  resources
                                </Badge>
                              )}
                              {server.capabilities.prompts?.length > 0 && (
                                <Badge variant="outline" className="text-xs">
                                  {server.capabilities.prompts.length} prompts
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleRemoveServer(server.name)}
                          disabled={removingServers[server.name]}
                          className="ml-4"
                        >
                          {removingServers[server.name] ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <div className="flex items-center">
                              <Trash2 className="mr-2 h-4 w-4" />
                              Remove
                            </div>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog
        open={showManualConfigDialog}
        onOpenChange={setShowManualConfigDialog}
      >
        <DialogContent className="dark:bg-background/95 sm:max-w-[600px] dark:border-gray-700">
          <DialogHeader>
            <DialogTitle>Add MCP Server</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Configure a new MCP server by providing its configuration in JSON
              format. You can copy this from the server&apos;s documentation or
              GitHub page.
            </p>
            <div className="relative">
              <textarea
                value={manualConfig}
                onChange={(e) => {
                  setManualConfig(e.target.value);
                  if (manualConfigError) {
                    setManualConfigError(null);
                  }
                }}
                className="bg-secondary/50 dark:bg-background/60 h-[300px] w-full rounded-md border p-4 font-mono text-xs dark:border-gray-700"
                placeholder={`{
  "mcpServers": {
    "example-server": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-server-example"
      ],
      "description": "Example MCP server"
    }
  }
}`}
              />
            </div>
            {manualConfigError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{manualConfigError}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter className="mt-4">
            <DialogClose asChild>
              <Button
                type="button"
                variant="secondary"
                className="dark:bg-background/60 dark:text-foreground dark:border-gray-700"
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              onClick={handleSubmitManualConfig}
              disabled={!manualConfig.trim() || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
