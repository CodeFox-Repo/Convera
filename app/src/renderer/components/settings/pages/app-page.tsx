import { Button } from "@/renderer/components/ui/button";
import { Input } from "@/renderer/components/ui/input";
import { getApiBaseUrl } from "@/renderer/libs/env";
import { MCPServerConfig } from "@/shared/types/mcp";
import {
  CheckCircle,
  ExternalLink,
  Loader2,
  Plug,
  Plus,
  Search,
  Trash2,
  Tag,
  User,
  Globe,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";

interface App {
  id: string;
  name: string;
  description: string;
  iconUrl?: string;
  config: MCPServerConfig;
  version?: string;
  keywords?: string[];
  author?: {
    name: string;
    url?: string;
  };
  fileType?: string;
  fileContent?: string;
  createdAt: string;
  updatedAt: string;
}

export function AppSettingsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [apps, setApps] = useState<App[]>([]);
  const [installedApps, setInstalledApps] = useState<Set<string>>(new Set());
  const [installing, setInstalling] = useState<Set<string>>(new Set());

  // Helper function to get icon for app
  const getAppIcon = (app: App) => {
    if (app.iconUrl) {
      return (
        <img
          src={app.iconUrl}
          alt={app.name}
          className="h-10 w-10 object-contain rounded-md"
        />
      );
    }
    return <Plug className="h-10 w-10 text-muted-foreground" />;
  };

  // Fetch apps from API and check installed status
  const fetchApps = async () => {
    try {
      setLoading(true);

      // Fetch available apps from server
      const appsResponse = await fetch(`${getApiBaseUrl()}/app`);
      if (!appsResponse.ok) {
        throw new Error("Failed to fetch apps");
      }
      const appsResult = await appsResponse.json();

      if (!appsResult.success) {
        throw new Error(appsResult.error || "Failed to fetch apps");
      }

      setApps(appsResult.data.mcpServers || []);

      // Fetch installed MCP servers to check which apps are installed
      try {
        const installedResponse = await window.mcpAPI.getServers();
        window.logger
          .getLogger("test")
          .info(JSON.stringify(installedResponse.data));
        if (installedResponse.success && installedResponse.data) {
          // Debug: Log each server's isApp status
          installedResponse.data.forEach((server) => {
            console.log(
              `Server "${server.name}": isApp=${server.isApp} (type: ${typeof server.isApp})`,
            );
          });

          // Filter servers that are marked as apps
          const installedAppIds = new Set(
            installedResponse.data
              .filter((server) => {
                const isApp = server.isApp === true;
                console.log(
                  `Filtering server "${server.name}": isApp=${server.isApp} -> include=${isApp}`,
                );
                return isApp;
              })
              .map((server) => server.name),
          );

          console.log("Final installed app IDs:", Array.from(installedAppIds));
          setInstalledApps(installedAppIds);
        }
      } catch (error) {
        console.error("Error fetching installed apps:", error);
        // Continue even if this fails, just won't show installed status
      }
    } catch (error) {
      console.error("Error fetching apps:", error);
      toast.error("Failed to load applications");
    } finally {
      setLoading(false);
    }
  };

  // Load apps on mount
  useEffect(() => {
    fetchApps();
  }, []);

  // Handle app installation
  const handleInstall = async (app: App) => {
    setInstalling((prev) => new Set(prev).add(app.id));

    try {
      // Prepare config with isApp flag
      const config = {
        ...app.config,
        isApp: true, // Mark this as an app, not a pure MCP server
        name: app.name,
        description: app.description,
      };

      const response = await window.mcpAPI.addServer(app.id, config);

      if (!response.success) {
        throw new Error(response.error || "Failed to install app");
      }

      toast.success(`${app.name} installed successfully!`);

      // Update installed apps state
      setInstalledApps((prev) => new Set(prev).add(app.id));
    } catch (error) {
      console.error(`Error installing ${app.name}:`, error);
      toast.error(
        `Failed to install ${app.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setInstalling((prev) => {
        const newSet = new Set(prev);
        newSet.delete(app.id);
        return newSet;
      });
    }
  };

  // Handle app uninstallation
  const handleUninstall = async (app: App) => {
    if (!window.confirm(`Are you sure you want to uninstall "${app.name}"?`)) {
      return;
    }

    try {
      const response = await window.mcpAPI.removeServer(app.id);

      if (!response.success) {
        throw new Error(response.error || "Failed to uninstall app");
      }

      toast.success(`${app.name} uninstalled successfully!`);

      // Update installed apps state
      setInstalledApps((prev) => {
        const newSet = new Set(prev);
        newSet.delete(app.id);
        return newSet;
      });
    } catch (error) {
      console.error(`Error uninstalling ${app.name}:`, error);
      toast.error(
        `Failed to uninstall ${app.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  // Get unique categories from all apps
  const getAppCategory = (app: App) => {
    if (app.config?.url) return "web-services";
    if (app.config?.command) return "desktop-apps";
    return "tools";
  };

  const categories = [
    "all",
    ...new Set(apps.map((app) => getAppCategory(app))),
  ];

  // Filter apps and separate installed/available
  const allFilteredApps = apps.filter((app) => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch =
      searchQuery === "" ||
      app.name.toLowerCase().includes(searchLower) ||
      app.description.toLowerCase().includes(searchLower) ||
      app.author?.name.toLowerCase().includes(searchLower) ||
      app.keywords?.some(keyword => keyword.toLowerCase().includes(searchLower));

    const matchesCategory =
      selectedCategory === "all" || getAppCategory(app) === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const installedFilteredApps = allFilteredApps.filter((app) => {
    const isInstalled = installedApps.has(app.id);
    console.log(`App "${app.id}" -> installed: ${isInstalled}`);
    return isInstalled;
  });

  console.log(
    "All apps:",
    apps.map((app) => app.id),
  );
  console.log("Installed app IDs from state:", Array.from(installedApps));
  console.log(
    "Installed filtered apps:",
    installedFilteredApps.map((app) => app.id),
  );
  const availableFilteredApps = allFilteredApps.filter(
    (app) => !installedApps.has(app.id),
  );

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Loading applications...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show global empty state when no apps exist at all
  if (apps.length === 0) {
    return (
      <div className="p-6">
        <div className="space-y-8">
          <div>
            <h1 className="text-2xl font-semibold text-foreground mb-2">
              App Market
            </h1>
            <p className="text-muted-foreground">
              Browse and discover applications to enhance your AI
              assistant&apos;s capabilities
            </p>
          </div>

          <div className="text-center py-16 border border-border rounded-lg">
            <Plug className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-medium mb-2">
              No applications available
            </h3>
            <p className="text-muted-foreground mb-6">
              Applications will appear here when they are added to the
              marketplace
            </p>
            <Button variant="outline">
              <ExternalLink className="h-4 w-4 mr-2" />
              Learn more about applications
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-foreground mb-2">
            App Market
          </h1>
          <p className="text-muted-foreground">
            Browse and discover applications to enhance your AI assistant&apos;s
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

        {/* Installed Applications Section - Always show */}
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-medium text-foreground">
              Installed ({installedFilteredApps.length})
            </h2>
          </div>

          {installedFilteredApps.length > 0 ? (
            <div className="space-y-2">
              {installedFilteredApps.map((app) => (
                <div
                  key={app.id}
                  className="p-3 border border-border rounded-lg hover:bg-muted/20 transition-colors group flex items-center justify-between"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="relative">
                      {getAppIcon(app)}
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-600 rounded-full flex items-center justify-center">
                        <CheckCircle className="h-2.5 w-2.5 text-white" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-foreground truncate">
                          {app.name}
                        </h3>
                        {app.version && (
                          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            v{app.version}
                          </span>
                        )}
                      </div>
                      {app.author?.name && (
                        <div className="flex items-center gap-1 mt-1">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground truncate">
                            {app.author.name}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleUninstall(app)}
                    className="text-muted-foreground hover:text-red-600 hover:border-red-300 opacity-0 group-hover:opacity-100 transition-all duration-200 px-2"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 border border-border rounded-lg bg-muted/20">
              <CheckCircle className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <h3 className="font-medium mb-1">No apps installed yet</h3>
              <p className="text-sm text-muted-foreground">
                Install applications from the available section below
              </p>
            </div>
          )}
        </div>

        {/* Available Applications Section */}
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-medium text-foreground">
              Available Applications ({availableFilteredApps.length})
            </h2>
          </div>

          {availableFilteredApps.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {availableFilteredApps.map((app) => (
                <div
                  key={app.id}
                  className="p-4 border border-border rounded-lg hover:bg-muted/20 transition-colors cursor-pointer group"
                  onClick={() => handleInstall(app)}
                >
                  <div className="flex flex-col gap-3">
                    {/* Header with icon, name, and install button */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {getAppIcon(app)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium text-foreground truncate">
                              {app.name}
                            </h3>
                            {app.version && (
                              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                v{app.version}
                              </span>
                            )}
                          </div>
                          {app.author?.name && (
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground truncate">
                                {app.author.name}
                              </span>
                              {app.author.url && (
                                <Globe className="h-3 w-3 text-muted-foreground" />
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center ml-3">
                        {installing.has(app.id) ? (
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        ) : (
                          <Plus className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                        )}
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-sm text-muted-foreground line-clamp-2 leading-5">
                      {app.description}
                    </p>

                    {/* Keywords */}
                    {app.keywords && app.keywords.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        <Tag className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        <div className="flex flex-wrap gap-1">
                          {app.keywords.slice(0, 3).map((keyword, index) => (
                            <span
                              key={index}
                              className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded"
                            >
                              {keyword}
                            </span>
                          ))}
                          {app.keywords.length > 3 && (
                            <span className="text-xs text-muted-foreground">
                              +{app.keywords.length - 3} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 border border-border rounded-lg bg-muted/20">
              <Plus className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-medium mb-2">
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
    </div>
  );
}
