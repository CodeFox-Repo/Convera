import { McpMarketplaceItem, MCPServer } from "@/shared/types/settings";
import { ExternalLink, Loader2, Plus, Trash2 } from "lucide-react";
import React, { useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

type MarketplaceSectionProps = {
  mcpMarketItems: McpMarketplaceItem[];
  mcpServers: MCPServer[];
  installingTools: Record<string, boolean>;
  loadingMarketplace: boolean;
  loadingMcpServers: boolean;
  onInstallMcpTool: (tool: McpMarketplaceItem) => void;
  onInstallPredefinedServer: (serverId: string) => void;
  onUninstallPredefinedServer?: (serverId: string) => Promise<void>;
  onManualInstallMcp?: (configJson: string) => Promise<void>;
};

export function MarketplaceSection({
  mcpMarketItems,
  mcpServers,
  installingTools,
  loadingMarketplace,
  loadingMcpServers,
  onInstallMcpTool,
  onInstallPredefinedServer,
  onUninstallPredefinedServer,
  onManualInstallMcp,
}: MarketplaceSectionProps) {
  const [showManualConfigDialog, setShowManualConfigDialog] = useState(false);
  const [showCommunityConfigDialog, setShowCommunityConfigDialog] =
    useState(false);
  const [selectedCommunityItem, setSelectedCommunityItem] =
    useState<McpMarketplaceItem | null>(null);
  const [manualConfig, setManualConfig] = useState("");
  const [communityConfig, setCommunityConfig] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uninstallingServers, setUninstallingServers] = useState<
    Record<string, boolean>
  >({});
  const [searchQuery, setSearchQuery] = useState("");

  const handleSubmitManualConfig = async () => {
    if (!manualConfig.trim() || !onManualInstallMcp) return;

    setIsSubmitting(true);
    try {
      await onManualInstallMcp(manualConfig);
      setShowManualConfigDialog(false);
      setManualConfig("");
    } catch (error) {
      console.error("Error submitting manual config:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitCommunityConfig = async () => {
    if (!communityConfig.trim() || !onManualInstallMcp) return;

    setIsSubmitting(true);
    try {
      await onManualInstallMcp(communityConfig);
      setShowCommunityConfigDialog(false);
      setCommunityConfig("");
      setSelectedCommunityItem(null);

      if (selectedCommunityItem) {
        onInstallMcpTool(selectedCommunityItem);
      }
    } catch (error) {
      console.error("Error submitting community config:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenCommunityDialog = (item: McpMarketplaceItem) => {
    setSelectedCommunityItem(item);
    setCommunityConfig("");
    setShowCommunityConfigDialog(true);
  };

  const handleUninstallServer = async (serverId: string) => {
    if (!onUninstallPredefinedServer) return;

    setUninstallingServers((prev) => ({ ...prev, [serverId]: true }));
    try {
      await onUninstallPredefinedServer(serverId);
    } catch (error) {
      console.error(`Error uninstalling server ${serverId}:`, error);
    } finally {
      setUninstallingServers((prev) => ({ ...prev, [serverId]: false }));
    }
  };

  const availableServers = mcpServers
    .filter((server) => server.kind === "predefined" && !server.isInstalled)
    .filter(
      (server) =>
        searchQuery === "" ||
        server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (server.description &&
          server.description.toLowerCase().includes(searchQuery.toLowerCase())),
    );

  const installedServers = mcpServers.filter(
    (server) => server.kind === "installed",
  );

  const filteredMarketItems = mcpMarketItems.filter(
    (item) =>
      searchQuery === "" ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tags.some((tag) =>
        tag.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
  );

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-medium text-foreground">MCP Marketplace</h2>
            <p className="text-muted-foreground mt-1">
              Browse and install MCP tools and servers for enhanced
              functionality
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowManualConfigDialog(true)}
            className="dark:bg-background/60 flex items-center gap-1 dark:border-gray-700"
          >
            <Plus className="h-4 w-4" />
            Manual Install
          </Button>
        </div>
      </div>

      <Tabs defaultValue="marketplace" className="w-full">
        <TabsList className="dark:bg-background/60 mb-4">
          <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
          <TabsTrigger value="installed">Installed</TabsTrigger>
        </TabsList>

        <TabsContent value="marketplace" className="space-y-6">
          <div className="relative">
            <div className="border-border bg-secondary/30 focus-within:ring-primary/30 dark:bg-background/60 flex items-center rounded-md border px-3 py-2 focus-within:ring-1 dark:border-gray-700">
              <input
                type="text"
                placeholder="Search"
                className="text-foreground placeholder:text-muted-foreground flex-1 border-none bg-transparent text-sm outline-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="text-muted-foreground h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>

          <div className="text-muted-foreground flex items-center text-sm">
            <span>Want to add MCP servers outside the marketplace?</span>
            <Button
              variant="link"
              className="text-primary ml-1 h-auto p-0"
              onClick={() => setShowManualConfigDialog(true)}
            >
              Configure Manually
            </Button>
          </div>

          <div>
            <h3 className="text-foreground mb-4 text-xl font-semibold">
              MCP Servers and Tools
            </h3>
            <div className="space-y-4">
              {loadingMcpServers || loadingMarketplace ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
                </div>
              ) : availableServers.length === 0 &&
                filteredMarketItems.length === 0 ? (
                <p className="text-muted-foreground">
                  No servers or marketplace items available
                </p>
              ) : (
                <div>
                  <div className="flex flex-col space-y-4">
                    {availableServers.map((server) => {
                      const isInstalled =
                        server.isInstalled === true ||
                        installedServers.some(
                          (installed) =>
                            installed.id === server.id ||
                            installed.name === server.name,
                        );

                      return (
                        <div
                          key={server.id}
                          className="border-l-4 border-l-primary border-b border-border pb-4 last:border-0 hover:bg-secondary/10 transition-all duration-200 pl-3 group relative"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="text-foreground font-semibold">
                                    {server.name}
                                  </h4>
                                  <Badge className="bg-primary text-xs text-white/90 dark:text-white/90">
                                    Easy Install
                                  </Badge>
                                  {isInstalled && (
                                    <Badge className="border-green-600/20 bg-green-600/10 text-green-600 dark:bg-green-900/20 dark:text-green-400">
                                      Installed
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-muted-foreground line-clamp-1 text-sm mt-1">
                                  {server.description ||
                                    "No description available"}
                                </p>

                                {server.installInstructions && (
                                  <div className="text-muted-foreground mt-2 text-xs">
                                    <p className="font-semibold">
                                      Installation Notes:
                                    </p>
                                    <p>{server.installInstructions}</p>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex justify-end">
                              {isInstalled ? (
                                <Badge className="ml-4 border-gray-600/20 bg-gray-600/10 text-gray-600">
                                  Installed
                                </Badge>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="bg-primary hover:bg-primary/90 ml-4 text-white/90 dark:text-white/90 w-8 opacity-0 group-hover:opacity-100 transition-all duration-200"
                                  onClick={() => onInstallPredefinedServer(server.id)}
                                  disabled={installingTools[server.id]}
                                >
                                  {installingTools[server.id] ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    "+"
                                  )}
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {filteredMarketItems.map((item) => {
                      const isInstalled = installedServers.some(
                        (server) =>
                          server.name === item.name ||
                          server.id === item.mcpId,
                      );

                      return (
                        <div
                          key={item.mcpId}
                          className="border-l-4 border-l-blue-500 border-b border-border pb-4 last:border-0 hover:bg-secondary/10 transition-all duration-200 pl-3 group relative"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="text-foreground font-semibold">
                                    {item.name}
                                  </h4>
                                  {isInstalled && (
                                    <Badge className="border-green-600/20 bg-green-600/10 text-green-600 dark:bg-green-900/20 dark:text-green-400">
                                      Installed
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-muted-foreground line-clamp-1 text-sm mt-1">
                                  {item.description}
                                </p>
                              </div>
                            </div>

                            {isInstalled ? (
                              <Badge className="ml-4 border-gray-600/20 bg-gray-600/10 text-gray-600">
                                Installed
                              </Badge>
                            ) : (
                              <Button
                                size="sm"
                                variant="default"
                                className="bg-primary hover:bg-primary/90 ml-4 text-white/90 dark:text-white/90 w-8 opacity-0 group-hover:opacity-100 transition-all duration-200"
                                onClick={() => handleOpenCommunityDialog(item)}
                                disabled={installingTools[item.mcpId]}
                              >
                                {installingTools[item.mcpId] ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  "+"
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="installed" className="space-y-6">
          <div>
            <h3 className="text-foreground mb-4 text-xl font-semibold">
              Installed MCP Servers
            </h3>
            <div className="space-y-4">
              {loadingMcpServers ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
                </div>
              ) : installedServers.length === 0 ? (
                <p className="text-muted-foreground">
                  No installed MCP servers found
                </p>
              ) : (
                <div className="flex flex-col space-y-4">
                  {installedServers.map((server) => (
                    <div
                      key={server.id}
                      className="border-l-4 border-l-green-500 border-b border-border pb-4 last:border-0 hover:bg-secondary/10 transition-all duration-200 pl-3 group relative"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-foreground font-semibold">
                                {server.name}
                              </h4>
                              <Badge
                                className={
                                  server.running
                                    ? "border-green-600/20 bg-green-600/10 text-green-600 dark:bg-green-900/20 dark:text-green-400"
                                    : "border-amber-600/20 bg-amber-600/10 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400"
                                }
                              >
                                {server.running ? "Running" : "Installed"}
                              </Badge>
                            </div>

                            <p className="text-muted-foreground line-clamp-1 text-sm mt-1">
                              {server.description || "No description available"}
                            </p>

                            <div className="mt-2 flex flex-wrap gap-2">
                              <Badge
                                className={
                                  server.enabled
                                    ? "border-blue-600/20 bg-blue-600/10 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                                    : "border-gray-600/20 bg-gray-600/10 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400"
                                }
                                variant="outline"
                              >
                                {server.enabled ? "Enabled" : "Disabled"}
                              </Badge>
                              <Badge
                                variant="outline"
                                className="bg-secondary/60 dark:bg-background/60 text-xs dark:border-gray-700"
                              >
                                {server.toolCount || 0} Tools
                              </Badge>
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleUninstallServer(server.id)}
                            disabled={uninstallingServers[server.id]}
                            className="ml-4"
                          >
                            {uninstallingServers[server.id] ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <div className="flex items-center">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Uninstall
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
        </TabsContent>
      </Tabs>

      <Dialog
        open={showManualConfigDialog}
        onOpenChange={setShowManualConfigDialog}
      >
        <DialogContent className="dark:bg-background/95 sm:max-w-[600px] dark:border-gray-700">
          <DialogHeader>
            <DialogTitle>Configure Manually</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Please copy the configuration JSON from the MCP server&apos;s
              introduction page (preferably use NPX or UVX configuration) and
              paste it into the input field.
            </p>
            <div className="relative">
              <textarea
                value={manualConfig}
                onChange={(e) => setManualConfig(e.target.value)}
                className="bg-secondary/50 dark:bg-background/60 h-[300px] w-full rounded-md border p-4 font-mono text-xs dark:border-gray-700"
                placeholder={`// Example:
// {
//   "mcpServers": {
//     "example-server": {
//       "command": "npx",
//       "args": [
//         "-y",
//         "mcp-server-example"
//       ]
//     }
//   }
// }`}
              />
            </div>
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
                  Installing...
                </>
              ) : (
                "Install"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showCommunityConfigDialog}
        onOpenChange={setShowCommunityConfigDialog}
      >
        <DialogContent className="dark:bg-background/95 sm:max-w-[600px] dark:border-gray-700">
          <DialogHeader>
            <DialogTitle>
              {selectedCommunityItem?.name || "Install MCP Tool"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Some community tools require additional configuration. Please copy
              the configuration JSON from the tool&apos;s documentation or
              GitHub page if required.
            </p>
            <div className="relative">
              <textarea
                value={communityConfig}
                onChange={(e) => setCommunityConfig(e.target.value)}
                className="bg-secondary/50 dark:bg-background/60 h-[200px] w-full rounded-md border p-4 font-mono text-xs dark:border-gray-700"
                placeholder={`// Example:
// {
//   "mcpServers": {
//     "example-server": {
//       "command": "npx",
//       "args": [
//         "-y",
//         "mcp-server-example"
//       ]
//     }
//   }
// }`}
              />
            </div>
            {selectedCommunityItem?.githubUrl && (
              <div className="flex items-center justify-end">
                <a
                  href={selectedCommunityItem.githubUrl.startsWith("http")
                    ? selectedCommunityItem.githubUrl
                    : `https://${selectedCommunityItem.githubUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary flex items-center gap-1 text-sm hover:underline"
                >
                  View Documentation
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
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
              onClick={handleSubmitCommunityConfig}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Installing...
                </>
              ) : (
                "Install"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
