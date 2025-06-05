import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/renderer/components/ui/accordion";
import { Badge } from "@/renderer/components/ui/badge";
import { Button } from "@/renderer/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/renderer/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/renderer/components/ui/dialog";
import { Input } from "@/renderer/components/ui/input";
import { Label } from "@/renderer/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/renderer/components/ui/tabs";
import {
  Calendar,
  CheckCircle,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Github,
  Globe,
  Loader2,
  Mail,
  Plug,
  Search,
  Settings,
  Slack,
  Trash2,
  Twitter
} from "lucide-react";
import React, { useState } from "react";
import { toast } from "sonner";

interface ConnectedApp {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  status: "connected" | "error" | "pending";
  connectedAt: string;
  permissions: string[];
  category: string;
}

interface AvailableApp {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: string;
  tags: string[];
  isConnected: boolean;
  isPopular: boolean;
  documentation?: string;
}

export function ConnectAppsTab() {
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [isConnecting, setIsConnecting] = useState<Record<string, boolean>>({});
  const [selectedApp, setSelectedApp] = useState<AvailableApp | null>(null);
  const [showAppDetails, setShowAppDetails] = useState(false);
  const [activeTab, setActiveTab] = useState("api-key");

  // Mock data for connected apps
  const [connectedApps] = useState<ConnectedApp[]>([
    {
      id: "gmail",
      name: "Gmail",
      description: "Access and manage your Gmail emails",
      icon: <Mail className="h-8 w-8 text-red-500" />,
      status: "connected",
      connectedAt: "2024-01-15",
      permissions: ["Read emails", "Send emails", "Manage labels"],
      category: "Communication"
    },
    {
      id: "github",
      name: "GitHub",
      description: "Manage repositories and pull requests",
      icon: <Github className="h-8 w-8 text-gray-800 dark:text-white" />,
      status: "connected",
      connectedAt: "2024-01-10",
      permissions: ["Read repositories", "Create issues", "Manage pull requests"],
      category: "Development"
    },
    {
      id: "slack",
      name: "Slack",
      description: "Send messages and manage channels",
      icon: <Slack className="h-8 w-8 text-purple-500" />,
      status: "error",
      connectedAt: "2024-01-08",
      permissions: ["Send messages", "Read channels", "Manage workspace"],
      category: "Communication"
    }
  ]);

  // Mock data for available apps
  const [availableApps] = useState<AvailableApp[]>([
    {
      id: "twitter",
      name: "Twitter/X",
      description: "Post tweets and manage your Twitter account",
      icon: <Twitter className="h-8 w-8 text-blue-400" />,
      category: "Social Media",
      tags: ["social", "posting", "engagement"],
      isConnected: false,
      isPopular: true,
      documentation: "https://docs.composio.dev/apps/twitter"
    },
    {
      id: "calendar",
      name: "Google Calendar",
      description: "Create and manage calendar events",
      icon: <Calendar className="h-8 w-8 text-blue-600" />,
      category: "Productivity",
      tags: ["calendar", "scheduling", "events"],
      isConnected: false,
      isPopular: true,
      documentation: "https://docs.composio.dev/apps/calendar"
    },
    {
      id: "notion",
      name: "Notion",
      description: "Create and manage Notion pages and databases",
      icon: <FileText className="h-8 w-8 text-gray-800 dark:text-white" />,
      category: "Productivity",
      tags: ["notes", "database", "collaboration"],
      isConnected: false,
      isPopular: true,
      documentation: "https://docs.composio.dev/apps/notion"
    },
    {
      id: "linkedin",
      name: "LinkedIn",
      description: "Manage your LinkedIn profile and connections",
      icon: <Globe className="h-8 w-8 text-blue-700" />,
      category: "Social Media",
      tags: ["professional", "networking", "career"],
      isConnected: false,
      isPopular: false,
      documentation: "https://docs.composio.dev/apps/linkedin"
    },
    {
      id: "mysql",
      name: "MySQL",
      description: "Execute queries and manage MySQL databases",
      icon: <Database className="h-8 w-8 text-orange-600" />,
      category: "Database",
      tags: ["database", "sql", "queries"],
      isConnected: false,
      isPopular: false,
      documentation: "https://docs.composio.dev/apps/mysql"
    },
    {
      id: "postgresql",
      name: "PostgreSQL",
      description: "Execute queries and manage PostgreSQL databases",
      icon: <Database className="h-8 w-8 text-blue-800" />,
      category: "Database",
      tags: ["database", "sql", "queries"],
      isConnected: false,
      isPopular: false,
      documentation: "https://docs.composio.dev/apps/postgresql"
    }
  ]);

  const categories = ["all", "Communication", "Development", "Social Media", "Productivity", "Database"];

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) {
      toast.error("Please enter a valid API key");
      return;
    }

    setIsSaving(true);
    try {
      // Mock API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      toast.success("Composio API key saved successfully");
    } catch (error) {
      console.error("Error saving API key:", error);
      toast.error("Failed to save API key");
    } finally {
      setIsSaving(false);
    }
  };

  const handleConnectApp = async (app: AvailableApp) => {
    if (!apiKey.trim()) {
      toast.error("Please set your Composio API key first");
      return;
    }

    setIsConnecting(prev => ({ ...prev, [app.id]: true }));
    try {
      // Mock connection process
      await new Promise(resolve => setTimeout(resolve, 2000));
      toast.success(`Successfully connected to ${app.name}`);
    } catch (error) {
      console.error(`Error connecting to ${app.name}:`, error);
      toast.error(`Failed to connect to ${app.name}`);
    } finally {
      setIsConnecting(prev => ({ ...prev, [app.id]: false }));
    }
  };

  const handleDisconnectApp = async (app: ConnectedApp) => {
    try {
      // Mock disconnection process
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.success(`Disconnected from ${app.name}`);
    } catch (error) {
      console.error(`Error disconnecting from ${app.name}:`, error);
      toast.error(`Failed to disconnect from ${app.name}`);
    }
  };

  const handleViewAppDetails = (app: AvailableApp) => {
    setSelectedApp(app);
    setShowAppDetails(true);
  };

  const filteredApps = availableApps.filter(app => {
    const matchesSearch = searchQuery === "" || 
      app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = selectedCategory === "all" || app.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const getStatusBadge = (status: ConnectedApp["status"]) => {
    switch (status) {
      case "connected":
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Connected</Badge>;
      case "error":
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">Error</Badge>;
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">Pending</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-8">
      <div className="mb-6">
        <h2 className="text-2xl font-medium text-foreground mb-2">Connect Apps</h2>
        <p className="text-muted-foreground">
          Connect external applications using Composio to enhance your AI assistants capabilities
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="dark:bg-background/60 mb-6">
          <TabsTrigger value="api-key">API Configuration</TabsTrigger>
          <TabsTrigger value="connected">Connected Apps</TabsTrigger>
          <TabsTrigger value="apps">Browse Apps</TabsTrigger>
        </TabsList>

        {/* API Key Configuration Section */}
        <TabsContent value="api-key" className="space-y-6">
          <Card className="border-border/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Composio API Configuration
              </CardTitle>
              <CardDescription>
                Set up your Composio API key to enable app connections. 
                Get your API key from the{" "}
                <a 
                  href="https://app.composio.dev" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  Composio Dashboard
                  <ExternalLink className="h-3 w-3" />
                </a>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="api-key">Composio API Key</Label>
                <div className="relative">
                  <Input
                    id="api-key"
                    type={showApiKey ? "text" : "password"}
                    placeholder="Enter your Composio API key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="pr-10 border-border/30"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowApiKey(!showApiKey)}
                    aria-label={showApiKey ? "Hide API key" : "Show API key"}
                  >
                    {showApiKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <Button 
                onClick={handleSaveApiKey}
                disabled={isSaving || !apiKey.trim()}
                className="w-full sm:w-auto"
              >
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save API Key
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

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
                  Connect your first app to get started with enhanced AI capabilities
                </p>
                <Button onClick={() => setActiveTab("apps")}>
                  Browse Available Apps
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {connectedApps.map((app) => (
                <Card key={app.id} className="relative border-border/20">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {app.icon}
                        <div>
                          <CardTitle className="text-base">{app.name}</CardTitle>
                          <CardDescription className="text-sm">
                            {app.description}
                          </CardDescription>
                        </div>
                      </div>
                      {getStatusBadge(app.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Connected on {new Date(app.connectedAt).toLocaleDateString()}
                        </p>
                      </div>
                      
                      <Accordion type="single" collapsible className="w-full">
                        <AccordionItem value="permissions" className="border-0">
                          <AccordionTrigger className="text-sm py-2 hover:no-underline">
                            View Permissions ({app.permissions.length})
                          </AccordionTrigger>
                          <AccordionContent className="pt-0">
                            <ul className="space-y-1">
                              {app.permissions.map((permission, index) => (
                                <li key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <CheckCircle className="h-3 w-3 text-green-500" />
                                  {permission}
                                </li>
                              ))}
                            </ul>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>

                      <div className="flex gap-2 pt-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1 border-border/30"
                          onClick={() => handleDisconnectApp(app)}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Disconnect
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
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
                  variant={selectedCategory === category ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(category)}
                  className={`capitalize ${selectedCategory !== category ? 'border-border/30' : ''}`}
                >
                  {category}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredApps.map((app) => (
              <Card key={app.id} className="relative group hover:shadow-md transition-shadow border-border/20">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    {app.icon}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{app.name}</CardTitle>
                        {app.isPopular && (
                          <Badge variant="secondary" className="text-xs border-border/20">Popular</Badge>
                        )}
                      </div>
                      <CardDescription className="text-sm">
                        {app.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-1">
                      {app.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs border-border/30">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleConnectApp(app)}
                        disabled={isConnecting[app.id] || app.isConnected}
                        className="flex-1"
                      >
                        {isConnecting[app.id] && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {app.isConnected ? "Connected" : "Connect"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewAppDetails(app)}
                        className="border-border/30"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
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

      {/* App Details Dialog */}
      <Dialog open={showAppDetails} onOpenChange={setShowAppDetails}>
        <DialogContent className="max-w-lg border-border/20">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedApp?.icon}
              {selectedApp?.name}
            </DialogTitle>
            <DialogDescription>
              {selectedApp?.description}
            </DialogDescription>
          </DialogHeader>
          
          {selectedApp && (
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Category</h4>
                <Badge variant="outline" className="border-border/30">{selectedApp.category}</Badge>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Tags</h4>
                <div className="flex flex-wrap gap-1">
                  {selectedApp.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs border-border/20">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>

              {selectedApp.documentation && (
                <div>
                  <h4 className="font-medium mb-2">Documentation</h4>
                  <a
                    href={selectedApp.documentation}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    View Documentation
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAppDetails(false)} className="border-border/30">
              Close
            </Button>
            <Button 
              onClick={() => {
                if (selectedApp) {
                  handleConnectApp(selectedApp);
                  setShowAppDetails(false);
                }
              }}
              disabled={selectedApp?.isConnected}
            >
              {selectedApp?.isConnected ? "Already Connected" : "Connect App"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 