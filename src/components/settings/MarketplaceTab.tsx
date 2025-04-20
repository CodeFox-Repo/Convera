import React from "react";
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
import { Loader2, Github } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { McpMarketplaceItem, PredefinedMCPServer } from "@/types/settings";

type MarketplaceTabProps = {
  mcpMarketItems: McpMarketplaceItem[];
  predefinedServers: PredefinedMCPServer[];
  installingTools: Record<string, boolean>;
  loadingMarketplace: boolean;
  loadingPredefinedServers: boolean;
  onInstallMcpTool: (tool: McpMarketplaceItem) => void;
  onInstallPredefinedServer: (serverId: string) => void;
};

export function MarketplaceTab({
  mcpMarketItems,
  predefinedServers,
  installingTools,
  loadingMarketplace,
  loadingPredefinedServers,
  onInstallMcpTool,
  onInstallPredefinedServer,
}: MarketplaceTabProps) {
  return (
    <Card className="bg-card text-foreground border-none">
      <CardHeader>
        <CardTitle>MCP Marketplace</CardTitle>
        <CardDescription className="text-muted-foreground">
          Browse and install MCP tools and servers for enhanced functionality
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Predefined MCP Servers Section */}
        <div>
          <h3 className="text-foreground mb-4 text-xl font-semibold">
            Predefined MCP Servers
          </h3>
          <div className="space-y-4">
            {loadingPredefinedServers ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
              </div>
            ) : predefinedServers.length === 0 ? (
              <p className="text-muted-foreground">
                No predefined MCP servers available
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {predefinedServers.map((server) => (
                  <Card key={server.id} className="border-border bg-secondary">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-lg">{server.name}</CardTitle>
                        {server.isInstalled && (
                          <Badge
                            variant="outline"
                            className="bg-green-600/10 text-green-600 border-green-600/20"
                          >
                            Installed
                          </Badge>
                        )}
                      </div>
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
                    </CardHeader>
                    <CardContent className="pb-2">
                      <p className="text-foreground text-sm">
                        {server.description}
                      </p>
                      {server.installInstructions && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          <p className="font-semibold">Installation Notes:</p>
                          <p>{server.installInstructions}</p>
                        </div>
                      )}
                    </CardContent>
                    <CardFooter>
                      <Button
                        variant="secondary"
                        className="bg-secondary/80 hover:bg-secondary/60 w-full"
                        onClick={() => onInstallPredefinedServer(server.id)}
                        disabled={
                          installingTools[server.id] || server.isInstalled
                        }
                      >
                        {installingTools[server.id] ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Installing...
                          </>
                        ) : server.isInstalled ? (
                          "Installed"
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
            Marketplace
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
                          <CardTitle className="text-lg">{item.name}</CardTitle>
                          {item.isRecommended && (
                            <Badge variant="default" className="bg-blue-600">
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
      </CardContent>
    </Card>
  );
} 