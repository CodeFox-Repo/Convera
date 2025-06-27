import { Button } from "@/renderer/components/ui/button";
import { Input } from "@/renderer/components/ui/input";
import { MCPConfig } from "@/shared/types/settings";
import {
  CheckCircle,
  Download,
  ExternalLink,
  Loader2,
  Plug,
  Search,
  Trash2,
} from "lucide-react";
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
  const [loading, setLoading] = useState(true);
  const [connectedApps, setConnectedApps] = useState<ConnectedApp[]>([]);
  const [availableApps, setAvailableApps] = useState<AvailableApp[]>([]);

  // Helper function to get icon for app
  const getAppIcon = (app: ConnectedApp | AvailableApp) => {
    if (app.logoUrl) {
      return (
        <img
          src={app.logoUrl}
          alt={app.name}
          className="h-10 w-10 object-contain rounded-md"
        />
      );
    }
    return <Plug className="h-10 w-10 text-muted-foreground" />;
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
        await fetchApps();
      } else {
        throw new Error(result.error || "Failed to disconnect app");
      }
    } catch (error) {
      console.error(`Error disconnecting from ${app.name}:`, error);
      toast.error(`Failed to disconnect from ${app.name}`);
    }
  };

  // Get unique categories from all apps
  const categories = [
    "all",
    ...new Set([...connectedApps, ...availableApps].map((app) => app.category)),
  ];

  // Filter connected apps
  const filteredConnectedApps = connectedApps.filter((app) => {
    const matchesSearch =
      searchQuery === "" ||
      app.name.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      selectedCategory === "all" || app.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  // Filter available apps (excluding already connected ones)
  const unconnectedApps = availableApps.filter(
    (app) => !connectedApps.some((connectedApp) => connectedApp.id === app.id),
  );

  const filteredAvailableApps = unconnectedApps.filter((app) => {
    const matchesSearch =
      searchQuery === "" ||
      app.name.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      selectedCategory === "all" || app.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Loading applications...</p>
        </div>
      </div>
    );
  }

  // Show global empty state when no apps exist at all
  if (connectedApps.length === 0 && availableApps.length === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground mb-2">
            Applications
          </h1>
          <p className="text-muted-foreground">
            Connect external applications to enhance your AI assistant&apos;s
            capabilities
          </p>
        </div>

        <div className="text-center py-16 border border-border rounded-lg">
          <Plug className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-medium mb-2">
            No applications available
          </h3>
          <p className="text-muted-foreground mb-6">
            Applications will appear here when they become available through
            your AI provider
          </p>
          <Button variant="outline">
            <ExternalLink className="h-4 w-4 mr-2" />
            Learn more about app integrations
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground mb-2">
          Applications
        </h1>
        <p className="text-muted-foreground">
          Connect external applications to enhance your AI assistant&apos;s
          capabilities
        </p>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search applications..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {categories.map((category) => (
            <Button
              key={category}
              variant={selectedCategory === category ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(category)}
              className="capitalize"
            >
              {category === "all" ? "All" : category}
            </Button>
          ))}
        </div>
      </div>

      {/* Installed Apps Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-medium text-foreground">
            Installed Applications
          </h2>
        </div>

        {filteredConnectedApps.length > 0 ? (
          <div className="border border-border rounded-lg divide-y divide-border">
            {filteredConnectedApps.map((app) => (
              <div
                key={app.id}
                className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {getAppIcon(app)}
                  <div>
                    <h3 className="font-medium text-foreground">{app.name}</h3>
                    <p className="text-sm text-muted-foreground capitalize">
                      {app.category}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDisconnectApp(app)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Uninstall
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 border border-border rounded-lg bg-muted/20">
            <CheckCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-medium mb-1">
              {searchQuery || selectedCategory !== "all"
                ? "No installed applications match your search"
                : "No applications installed"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {searchQuery || selectedCategory !== "all"
                ? "Try adjusting your search terms or filters"
                : "Install your first application to get started"}
            </p>
          </div>
        )}
      </div>

      {/* Available Apps Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-medium text-foreground">
            Available Applications
          </h2>
        </div>

        {filteredAvailableApps.length > 0 ? (
          <div className="border border-border rounded-lg divide-y divide-border">
            {filteredAvailableApps.map((app) => (
              <div
                key={app.id}
                className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {getAppIcon(app)}
                  <div>
                    <h3 className="font-medium text-foreground">{app.name}</h3>
                    <p className="text-sm text-muted-foreground capitalize">
                      {app.category}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    onClick={() => handleConnectApp(app)}
                    disabled={isConnecting[app.id]}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {isConnecting[app.id] ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    Install
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 border border-border rounded-lg bg-muted/20">
            <Download className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-medium mb-1">
              {searchQuery || selectedCategory !== "all"
                ? "No available applications match your search"
                : "All applications are already installed"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {searchQuery || selectedCategory !== "all"
                ? "Try adjusting your search terms or filters"
                : "Check back later for new applications"}
            </p>
          </div>
        )}
      </div>

      {/* Clear Filters Button */}
      {(searchQuery || selectedCategory !== "all") && (
        <div className="text-center">
          <Button
            variant="outline"
            onClick={() => {
              setSearchQuery("");
              setSelectedCategory("all");
            }}
          >
            Clear all filters
          </Button>
        </div>
      )}
    </div>
  );
}
