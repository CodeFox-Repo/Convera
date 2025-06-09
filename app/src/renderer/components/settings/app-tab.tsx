import { Badge } from "@/renderer/components/ui/badge";
import { Button } from "@/renderer/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/renderer/components/ui/card";

import { Input } from "@/renderer/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/renderer/components/ui/tabs";
import { MCPConfig } from "@/shared/types/settings";
import { Loader2, Plug, Search, Trash2 } from "lucide-react";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";

interface ConnectedApp {
  id: string;
  name: string;
  logoUrl: string;
  category: string;
  mcpConfig?: MCPConfig;
}

interface AvailableApp {
  id: string;
  name: string;
  logoUrl: string;
  category: string;
  mcpConfig?: MCPConfig;
}

export function AppTab() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [isConnecting, setIsConnecting] = useState<Record<string, boolean>>({});

  const [activeTab, setActiveTab] = useState("apps");
  const [loading, setLoading] = useState(true);
  const [connectedApps, setConnectedApps] = useState<ConnectedApp[]>([]);
  const [availableApps, setAvailableApps] = useState<AvailableApp[]>([]);

  // Helper function to get icon for app type
  const getAppIcon = (app: ConnectedApp | AvailableApp) => {
    if (app.logoUrl) {
      return (
        <img
          src={app.logoUrl}
          alt={app.name}
          className="h-8 w-8 object-contain rounded-sm"
        />
      );
    }
    return <Plug className="h-8 w-8 text-gray-500 flex-shrink-0" />;
  };

  // Fetch apps from API
  const fetchApps = async () => {
    try {
      setLoading(true);
      const response = await fetch("http://localhost:38000/api/apps");

      if (!response.ok) {
        throw new Error("Failed to fetch apps");
      }

      const result = await response.json();

      if (result.success) {
        setConnectedApps(result.data.connected || []);
        setAvailableApps(result.data.available || []);
      } else {
        throw new Error(result.error || "Failed to fetch apps");
      }
    } catch (error) {
      console.error("Error fetching apps:", error);
      toast.error("Failed to load apps");
    } finally {
      setLoading(false);
    }
  };

  // Load apps on mount
  useEffect(() => {
    fetchApps();
  }, []);

  const handleConnectApp = async (app: AvailableApp) => {
    setIsConnecting((prev) => ({ ...prev, [app.id]: true }));
    try {
      const response = await fetch("http://localhost:38000/api/apps/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ appId: app.id }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success(result.message);
        // Refresh the apps list
        await fetchApps();
      } else {
        throw new Error(result.error || "Failed to connect app");
      }
    } catch (error) {
      console.error(`Error connecting to ${app.name}:`, error);
      toast.error(`Failed to connect to ${app.name}`);
    } finally {
      setIsConnecting((prev) => ({ ...prev, [app.id]: false }));
    }
  };

  const handleDisconnectApp = async (app: ConnectedApp) => {
    try {
      const response = await fetch(
        "http://localhost:38000/api/apps/disconnect",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ appId: app.id }),
        },
      );

      const result = await response.json();

      if (result.success) {
        toast.success(result.message);
        // Refresh the apps list
        await fetchApps();
      } else {
        throw new Error(result.error || "Failed to disconnect app");
      }
    } catch (error) {
      console.error(`Error disconnecting from ${app.name}:`, error);
      toast.error(`Failed to disconnect from ${app.name}`);
    }
  };

  // Unified app card component
  const AppCard = ({
    app,
    isConnected,
  }: {
    app: ConnectedApp | AvailableApp;
    isConnected: boolean;
  }) => (
    <Card className="relative border-border/20 h-[180px] flex flex-col">
      <CardHeader className="pb-3 flex-none">
        <div className="flex flex-col items-center justify-center gap-3 flex-1 min-w-0">
          <div className="flex-none">{getAppIcon(app)}</div>
          <div className="min-w-0 text-center w-full">
            <CardTitle className="text-base truncate">{app.name}</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 flex-1 flex flex-col justify-end">
        <div className="space-y-3">
          <div className="flex gap-2">
            {isConnected ? (
              <Button
                variant="outline"
                size="sm"
                className="flex-1 border-border/30"
                onClick={() => handleDisconnectApp(app as ConnectedApp)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Disconnect
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => handleConnectApp(app as AvailableApp)}
                disabled={isConnecting[app.id]}
                className="flex-1"
              >
                {isConnecting[app.id] && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Connect
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // Get unique categories from all apps
  const categories = [
    "all",
    ...new Set([...connectedApps, ...availableApps].map((app) => app.category)),
  ];

  const filteredApps = availableApps.filter((app) => {
    const matchesSearch =
      searchQuery === "" ||
      app.name.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      selectedCategory === "all" || app.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading apps...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="mb-6">
        <h2 className="text-2xl font-medium text-foreground mb-2">Apps</h2>
        <p className="text-muted-foreground">
          Manage your connected applications and browse available apps
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="dark:bg-background/60 mb-6">
          <TabsTrigger value="apps">Browse Apps</TabsTrigger>
          <TabsTrigger value="connected">Connected Apps</TabsTrigger>
        </TabsList>

        {/* Connected Apps Section */}
        <TabsContent value="connected" className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Connected Applications</h3>
            <Badge variant="outline" className="px-2 py-1 border-border/30">
              {connectedApps.length} connected
            </Badge>
          </div>

          {connectedApps.length === 0 ? (
            <Card className="border-border/20">
              <CardContent className="text-center py-8">
                <Plug className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No Connected Apps</h3>
                <p className="text-muted-foreground mb-4">
                  Connect your first app to get started with enhanced AI
                  capabilities
                </p>
                <Button onClick={() => setActiveTab("apps")}>
                  Browse Available Apps
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {connectedApps.map((app) => (
                <AppCard key={app.id} app={app} isConnected={true} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Available Apps Section */}
        <TabsContent value="apps" className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search apps..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 border-border/30"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {categories.map((category) => (
                <Button
                  key={category}
                  variant={
                    selectedCategory === category ? "default" : "outline"
                  }
                  size="sm"
                  onClick={() => setSelectedCategory(category)}
                  className={`capitalize ${selectedCategory !== category ? "border-border/30" : ""}`}
                >
                  {category}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredApps.map((app) => (
              <AppCard key={app.id} app={app} isConnected={false} />
            ))}
          </div>

          {filteredApps.length === 0 && (
            <Card className="border-border/20">
              <CardContent className="text-center py-8">
                <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No Apps Found</h3>
                <p className="text-muted-foreground">
                  Try adjusting your search query or category filter
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
