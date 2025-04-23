import React, { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Github, Plus, Trash2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { McpMarketplaceItem, MCPServer } from "@/types/settings";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

type MarketplaceTabProps = {
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

export function MarketplaceTab({
  mcpMarketItems,
  mcpServers,
  installingTools,
  loadingMarketplace,
  loadingMcpServers,
  onInstallMcpTool,
  onInstallPredefinedServer,
  onUninstallPredefinedServer,
  onManualInstallMcp,
}: MarketplaceTabProps) {
  const [showManualConfigDialog, setShowManualConfigDialog] = useState(false);
  const [manualConfig, setManualConfig] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uninstallingServers, setUninstallingServers] = useState<
    Record<string, boolean>
  >({});

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

  // 根据kind字段筛选服务器
  const availableServers = mcpServers.filter(
    (server) => server.kind === "predefined" && !server.isInstalled,
  );
  const installedServers = mcpServers.filter(
    (server) => server.kind === "installed",
  );

  return (
    <Card className="bg-card text-foreground border-none">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>MCP Marketplace</CardTitle>
            <CardDescription className="text-muted-foreground">
              Browse and install MCP tools and servers for enhanced
              functionality
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowManualConfigDialog(true)}
            className="flex items-center gap-1"
          >
            <Plus className="h-4 w-4" />
            Manual Install
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs defaultValue="marketplace" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
            <TabsTrigger value="installed">Installed</TabsTrigger>
          </TabsList>

          <TabsContent value="marketplace" className="space-y-6">
            {/* Predefined MCP Servers Section */}
            <div>
              <h3 className="text-foreground mb-4 text-xl font-semibold">
                Predefined MCP Servers
              </h3>
              <div className="space-y-4">
                {loadingMcpServers ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
                  </div>
                ) : availableServers.length === 0 ? (
                  <p className="text-muted-foreground">
                    No available MCP servers found
                  </p>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {availableServers.map((server) => (
                      <Card
                        key={server.id}
                        className="border-border bg-secondary"
                      >
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between">
                            <CardTitle className="text-lg">
                              {server.name}
                            </CardTitle>
                          </div>
                          {server.repoUrl && (
                            <CardDescription className="text-muted-foreground flex items-center">
                              <Github className="mr-1 h-4 w-4" />
                              <a
                                href={`https://${server.repoUrl}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline"
                              >
                                {server.repoUrl}
                              </a>
                            </CardDescription>
                          )}
                        </CardHeader>
                        <CardContent className="pb-2">
                          <p className="text-foreground text-sm">
                            {server.description || "No description available"}
                          </p>
                          {server.installInstructions && (
                            <div className="text-muted-foreground mt-2 text-xs">
                              <p className="font-semibold">
                                Installation Notes:
                              </p>
                              <p>{server.installInstructions}</p>
                            </div>
                          )}
                        </CardContent>
                        <CardFooter>
                          <Button
                            variant="secondary"
                            className="bg-secondary/80 hover:bg-secondary/60 w-full"
                            onClick={() => onInstallPredefinedServer(server.id)}
                            disabled={installingTools[server.id]}
                          >
                            {installingTools[server.id] ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Installing...
                              </>
                            ) : (
                              "Install"
                            )}
                          </Button>
                        </CardFooter>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <Separator className="my-6" />

            {/* Marketplace Items Section */}
            <div>
              <h3 className="text-foreground mb-4 text-xl font-semibold">
                Community Marketplace
              </h3>
              <div className="space-y-4">
                {loadingMarketplace ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
                  </div>
                ) : mcpMarketItems.length === 0 ? (
                  <p className="text-muted-foreground">
                    No marketplace items available
                  </p>
                ) : (
                  <div className="custom-scrollbar max-h-[calc(100vh-500px)] overflow-y-auto pr-2">
                    <div className="grid gap-4 md:grid-cols-2">
                      {mcpMarketItems.map((item) => (
                        <Card
                          key={item.mcpId}
                          className="border-border bg-secondary"
                        >
                          <CardHeader className="pb-2">
                            <div className="flex items-start justify-between">
                              <CardTitle className="text-lg">
                                {item.name}
                              </CardTitle>
                              {item.isRecommended && (
                                <Badge
                                  variant="default"
                                  className="bg-blue-600"
                                >
                                  Recommended
                                </Badge>
                              )}
                            </div>
                            <CardDescription className="text-muted-foreground">
                              by {item.author}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="pb-2">
                            <p className="text-foreground text-sm">
                              {item.description}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1">
                              {item.tags.map((tag) => (
                                <Badge
                                  key={tag}
                                  variant="secondary"
                                  className="bg-secondary/80 text-xs"
                                >
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          </CardContent>
                          <CardFooter>
                            <Button
                              variant="secondary"
                              className="bg-secondary/80 hover:bg-secondary/60 w-full"
                              onClick={() => onInstallMcpTool(item)}
                              disabled={installingTools[item.mcpId]}
                            >
                              {installingTools[item.mcpId] ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Installing...
                                </>
                              ) : (
                                "Install"
                              )}
                            </Button>
                          </CardFooter>
                        </Card>
                      ))}
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
                  <div className="grid gap-4 md:grid-cols-2">
                    {installedServers.map((server) => (
                      <Card
                        key={server.id}
                        className="border-border bg-secondary"
                      >
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between">
                            <CardTitle className="text-lg">
                              {server.name}
                            </CardTitle>
                            <Badge
                              variant="outline"
                              className={
                                server.running
                                  ? "border-green-600/20 bg-green-600/10 text-green-600"
                                  : "border-amber-600/20 bg-amber-600/10 text-amber-600"
                              }
                            >
                              {server.running ? "Running" : "Installed"}
                            </Badge>
                          </div>
                          {server.isPredefined && server.repoUrl && (
                            <CardDescription className="text-muted-foreground flex items-center">
                              <Github className="mr-1 h-4 w-4" />
                              <a
                                href={`https://${server.repoUrl}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline"
                              >
                                {server.repoUrl}
                              </a>
                            </CardDescription>
                          )}
                          {server.isPredefined && !server.repoUrl && (
                            <CardDescription className="text-muted-foreground flex items-center">
                              <Github className="mr-1 h-4 w-4" />
                              <span>Predefined Server</span>
                            </CardDescription>
                          )}
                        </CardHeader>
                        <CardContent className="pb-2">
                          <p className="text-foreground text-sm">
                            {server.description || "No description available"}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {server.enabled ? (
                              <Badge className="border-blue-600/20 bg-blue-600/10 text-blue-600">
                                Enabled
                              </Badge>
                            ) : (
                              <Badge className="border-gray-600/20 bg-gray-600/10 text-gray-600">
                                Disabled
                              </Badge>
                            )}
                            <Badge className="bg-secondary/80 text-xs">
                              {server.toolCount || 0} Tools
                            </Badge>
                          </div>
                        </CardContent>
                        <CardFooter>
                          <Button
                            variant="destructive"
                            className="w-full"
                            onClick={() => handleUninstallServer(server.id)}
                            disabled={uninstallingServers[server.id]}
                          >
                            {uninstallingServers[server.id] ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Uninstalling...
                              </>
                            ) : (
                              <>
                                <Trash2 className="mr-2 h-4 w-4" />
                                Uninstall
                              </>
                            )}
                          </Button>
                        </CardFooter>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* Manual Config Dialog */}
      <Dialog
        open={showManualConfigDialog}
        onOpenChange={setShowManualConfigDialog}
      >
        <DialogContent className="sm:max-w-[600px]">
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
                className="bg-secondary/50 h-[300px] w-full rounded-md border p-4 font-mono text-xs"
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
              <Button type="button" variant="secondary">
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
                  Processing...
                </>
              ) : (
                "Confirm"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
