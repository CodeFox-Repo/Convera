import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { baseURL } from "@/lib/api-client";
import { Copy, Cpu, Download, Edit, FileJson, Plus, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface MCPServerConfig {
  name?: string;
  enabled?: boolean;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  url?: string;
  apiKey?: string;
  description?: string;
}

interface MCPServer {
  id: string;
  name: string;
  description: string;
  iconUrl: string;
  config: MCPServerConfig;
  createdAt: Date;
  updatedAt: Date;
}

interface MCPFormData {
  serverId: string;
  name: string;
  description: string;
  iconUrl: string;
  command: string;
  args: string;
  url: string;
  apiKey: string;
}

export function MCPManagement() {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<MCPServer | null>(null);
  const [formData, setFormData] = useState<MCPFormData>({
    serverId: "",
    name: "",
    description: "",
    iconUrl: "",
    command: "",
    args: "",
    url: "",
    apiKey: "",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [jsonImportOpen, setJsonImportOpen] = useState(false);
  const [jsonContent, setJsonContent] = useState("");
  const jsonFileInputRef = useRef<HTMLInputElement>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [jsonConfigView, setJsonConfigView] = useState("");

  // Fetch MCP servers
  const fetchServers = async () => {
    try {
      const response = await fetch(`${baseURL}/api/app`);
      const data = await response.json();
      if (data.success) {
        setServers(data.data.mcpServers);
      } else {
        toast({
          title: "Error",
          description: "Failed to fetch App MCP list",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to connect to server",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // State for icon file
  const [iconFile, setIconFile] = useState<File | null>(null);

  // Generate JSON view from form data
  const generateJsonFromForm = useCallback(() => {
    const config = {
      mcpServers: {
        [formData.serverId || "server-id"]: {
          ...(formData.name && { name: formData.name }),
          ...(formData.command && { command: formData.command }),
          ...(formData.args && {
            args: formData.args
              .split(",")
              .map((arg) => arg.trim())
              .filter(Boolean),
          }),
          ...(formData.url && { url: formData.url }),
          ...(formData.apiKey && { apiKey: formData.apiKey }),
          ...(formData.description && { description: formData.description }),
        },
      },
    };
    return JSON.stringify(config, null, 2);
  }, [formData]);

  // Parse JSON and update form data (silent mode for auto-parsing)
  const parseJsonToForm = (jsonStr: string, silent = false) => {
    try {
      const parsed = JSON.parse(jsonStr);

      // Support both formats: direct config or mcpServers wrapper
      let serverConfig;
      let serverId;

      if (parsed.mcpServers) {
        // Extract first server from mcpServers format
        const serverKeys = Object.keys(parsed.mcpServers);
        if (serverKeys.length > 0) {
          serverId = serverKeys[0];
          serverConfig = parsed.mcpServers[serverId];
        }
      } else {
        // Direct config format
        serverConfig = parsed;
        serverId = formData.serverId;
      }

      if (serverConfig) {
        setFormData((prev) => ({
          ...prev,
          ...(serverId && { serverId }),
          ...(serverConfig.name && { name: serverConfig.name }),
          ...(serverConfig.command && { command: serverConfig.command }),
          ...(serverConfig.args && {
            args: Array.isArray(serverConfig.args) ? serverConfig.args.join(", ") : "",
          }),
          ...(serverConfig.url && { url: serverConfig.url }),
          ...(serverConfig.apiKey && { apiKey: serverConfig.apiKey }),
          ...(serverConfig.description && { description: serverConfig.description }),
        }));
        setHasUnsavedChanges(true);
        return true;
      }
    } catch (error) {
      // Silent fail for auto-parsing, only log for manual parsing
      if (!silent) {
        console.error("Failed to parse JSON:", error);
      }
      return false;
    }
    return false;
  };

  // Handle image upload
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Debug: Log file type for SVG troubleshooting
    console.log("File type:", file.type, "File name:", file.name);

    // Validate file type
    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/svg+xml",
    ];

    const isValidImageType =
      file.type.startsWith("image/") ||
      allowedTypes.includes(file.type) ||
      file.name.toLowerCase().endsWith(".svg");

    if (!isValidImageType) {
      toast({
        title: "Error",
        description: "Please select a valid image file (JPEG, PNG, GIF, WebP, or SVG)",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "Image size must be less than 5MB",
        variant: "destructive",
      });
      return;
    }

    // Store the file for later upload
    setIconFile(file);
    setHasUnsavedChanges(true);

    // Create preview URL
    const previewUrl = URL.createObjectURL(file);
    setFormData((prev) => ({ ...prev, iconUrl: previewUrl }));

    toast({
      title: "Success",
      description: "Image selected successfully",
    });
  };

  // Save MCP server
  const saveServer = async () => {
    try {
      const config: MCPServerConfig = {
        name: formData.name,
        command: formData.command,
        args: formData.args
          .split(",")
          .map((arg) => arg.trim())
          .filter(Boolean),
        url: formData.url || undefined,
        apiKey: formData.apiKey || undefined,
        description: formData.description,
      };

      if (editingServer) {
        // For updates, still use JSON (existing functionality)
        const payload = {
          name: formData.name,
          description: formData.description,
          iconUrl: formData.iconUrl || undefined,
          config,
        };

        const response = await fetch(`${baseURL}/api/app/${editingServer.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (data.success) {
          toast({
            title: "Success",
            description: "App MCP updated successfully",
          });
          setDialogOpen(false);
          resetForm();
          setHasUnsavedChanges(false);
          fetchServers();
        } else {
          toast({
            title: "Error",
            description: data.error || "Failed to update App MCP",
            variant: "destructive",
          });
        }
      } else {
        // For creation, use FormData to include icon upload
        const formDataToSend = new FormData();
        formDataToSend.append("serverId", formData.serverId);
        formDataToSend.append("name", formData.name);
        formDataToSend.append("description", formData.description);
        formDataToSend.append("config", JSON.stringify(config));

        // Add icon file if selected
        if (iconFile) {
          formDataToSend.append("icon", iconFile);
        }

        const response = await fetch(`${baseURL}/api/app`, {
          method: "POST",
          credentials: "include",
          body: formDataToSend,
        });

        const data = await response.json();

        if (data.success) {
          toast({
            title: "Success",
            description: "App MCP created successfully",
          });
          setDialogOpen(false);
          resetForm();
          setHasUnsavedChanges(false);
          fetchServers();
        } else {
          toast({
            title: "Error",
            description: data.error || "Failed to create App MCP",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save App MCP",
        variant: "destructive",
      });
    }
  };

  // Delete MCP server
  const deleteServer = async (serverId: string) => {
    try {
      const response = await fetch(`${baseURL}/api/app/${serverId}`, {
        method: "DELETE",
        credentials: "include",
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: "Success",
          description: "App MCP deleted successfully",
        });
        fetchServers();
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to delete App MCP",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete App MCP",
        variant: "destructive",
      });
    }
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      serverId: "",
      name: "",
      description: "",
      iconUrl: "",
      command: "",
      args: "",
      url: "",
      apiKey: "",
    });
    setEditingServer(null);
    setHasUnsavedChanges(false);
    setIconFile(null);
  };

  // Open edit dialog
  const openEditDialog = (server: MCPServer) => {
    setEditingServer(server);
    setFormData({
      serverId: server.id,
      name: server.name,
      description: server.description,
      iconUrl: server.iconUrl || "",
      command: server.config.command || "",
      args: server.config.args?.join(", ") || "",
      url: server.config.url || "",
      apiKey: server.config.apiKey || "",
    });
    setDialogOpen(true);
  };

  // Copy config to clipboard
  const copyConfig = (server: MCPServer) => {
    const config = {
      mcpServers: {
        [server.id]: {
          command: server.config.command,
          args: server.config.args,
        },
      },
    };

    navigator.clipboard.writeText(JSON.stringify(config, null, 2));
    toast({
      title: "Success",
      description: "Configuration copied to clipboard",
    });
  };

  const formatDate = (dateString: Date) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Export all servers as JSON
  const exportServers = () => {
    const exportData = {
      mcpServers: servers.reduce(
        (acc, server) => {
          acc[server.id] = {
            name: server.name,
            description: server.description,
            command: server.config.command,
            args: server.config.args,
            iconUrl: server.iconUrl,
          };
          return acc;
        },
        {} as Record<
          string,
          {
            name: string;
            description: string;
            command?: string;
            args?: string[];
            iconUrl?: string;
          }
        >,
      ),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "app-mcp-config.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Success",
      description: "App MCP configuration exported",
    });
  };

  // Import servers from JSON
  const importServers = async () => {
    try {
      const parsed = JSON.parse(jsonContent);

      interface ImportServerPayload {
        serverId: string;
        name: string;
        description: string;
        iconUrl?: string;
        config: {
          name: string;
          command: string;
          args: string[];
          description: string;
          url?: string;
          apiKey?: string;
        };
      }

      let serversToImport: ImportServerPayload[] = [];

      // Handle array format (new format like the one provided)
      if (Array.isArray(parsed)) {
        serversToImport = parsed.map((server) => ({
          serverId: server.id,
          name: server.name,
          description: server.description || "",
          iconUrl: server.icon, // Note: this is the icon dataURL
          config: {
            name: server.name,
            command: server.config.command || "",
            args: server.config.args || [],
            description: server.description || "",
            ...(server.config.url && { url: server.config.url }),
            ...(server.config.apiKey && { apiKey: server.config.apiKey }),
          },
        }));
      }
      // Handle object format (existing mcpServers format)
      else {
        const mcpServers = parsed.mcpServers || parsed;

        if (typeof mcpServers !== "object") {
          throw new Error("Invalid JSON format");
        }

        serversToImport = Object.entries(mcpServers).map(([serverId, configData]) => {
          const config = configData as {
            name?: string;
            description?: string;
            command?: string;
            args?: string[];
            iconUrl?: string;
            url?: string;
            apiKey?: string;
          };

          return {
            serverId,
            name: config.name || serverId,
            description: config.description || "",
            iconUrl: config.iconUrl,
            config: {
              name: config.name || serverId,
              command: config.command || "",
              args: config.args || [],
              description: config.description || "",
              ...(config.url && { url: config.url }),
              ...(config.apiKey && { apiKey: config.apiKey }),
            },
          };
        });
      }

      const importPromises = serversToImport.map(async (payload) => {
        // Create FormData for each server (following the same pattern as saveServer)
        const formDataToSend = new FormData();
        formDataToSend.append("serverId", payload.serverId);
        formDataToSend.append("name", payload.name);
        formDataToSend.append("description", payload.description);
        formDataToSend.append("config", JSON.stringify(payload.config));

        // Handle base64 icon data if present
        if (payload.iconUrl && payload.iconUrl.startsWith("data:")) {
          try {
            // Convert base64 dataURL to blob
            const response = await fetch(payload.iconUrl);
            const blob = await response.blob();
            formDataToSend.append("icon", blob, "icon.png");
          } catch (error) {
            console.warn(`Failed to process icon for ${payload.serverId}:`, error);
          }
        }

        return fetch(`${baseURL}/api/app`, {
          method: "POST",
          credentials: "include",
          body: formDataToSend,
        });
      });

      const results = await Promise.allSettled(importPromises);
      const successful = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;

      if (successful > 0) {
        toast({
          title: "Import completed",
          description: `Successfully imported ${successful} App MCP${failed > 0 ? `, ${failed} failed` : ""}`,
        });
        setJsonImportOpen(false);
        setJsonContent("");
        fetchServers();
      } else {
        toast({
          title: "Import failed",
          description: "No App MCP were imported successfully",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Invalid JSON format",
        variant: "destructive",
      });
    }
  };

  // Handle JSON file upload
  const handleJsonFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      setJsonContent(e.target?.result as string);
    };
    reader.readAsText(file);
  };

  // Update JSON view when form data changes
  useEffect(() => {
    setJsonConfigView(generateJsonFromForm());
  }, [formData, generateJsonFromForm]);

  useEffect(() => {
    fetchServers();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="animate-pulse space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 rounded bg-gray-200"></div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={exportServers} disabled={servers.length === 0}>
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>

        <Dialog open={jsonImportOpen} onOpenChange={setJsonImportOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <FileJson className="mr-2 h-4 w-4" />
              Import JSON
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Import App MCP from JSON</DialogTitle>
              <DialogDescription>
                Import multiple App MCP configurations from a JSON file or paste JSON directly
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => jsonFileInputRef.current?.click()}
                  size="sm"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Upload JSON File
                </Button>
                <input
                  ref={jsonFileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleJsonFileUpload}
                  className="hidden"
                />
                <span className="text-sm text-gray-500">or paste JSON below</span>
              </div>

              <Textarea
                placeholder={`{
  "mcpServers": {
    "app-mcp-id": {
      "name": "App MCP Name",
      "description": "App MCP description",
      "command": "npx",
      "args": ["-y", "@foxychat-mcp/package-name"],
      "enabled": true
    }
  }
}`}
                value={jsonContent}
                onChange={(e) => setJsonContent(e.target.value)}
                className="min-h-[300px] font-mono text-sm"
              />
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setJsonImportOpen(false);
                  setJsonContent("");
                }}
              >
                Cancel
              </Button>
              <Button onClick={importServers} disabled={!jsonContent.trim()}>
                Import App MCP
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            if (!open && hasUnsavedChanges) {
              setShowConfirmDialog(true);
            } else {
              setDialogOpen(open);
              if (!open) {
                resetForm();
              }
            }
          }}
        >
          <DialogTrigger asChild>
            <Button
              onClick={() => {
                resetForm();
                setDialogOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add App MCP
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-6xl">
            <DialogHeader>
              <DialogTitle>{editingServer ? "Edit App MCP" : "Add New App MCP"}</DialogTitle>
              <DialogDescription>Configure an App MCP for the marketplace</DialogDescription>
            </DialogHeader>

            <div className="flex h-[600px] gap-6 py-4">
              {/* Left Panel - Form Fields */}
              <div className="flex-1 space-y-4 overflow-y-auto pr-2">
                <div className="space-y-2">
                  <Label htmlFor="serverId">Server ID</Label>
                  <Input
                    id="serverId"
                    value={formData.serverId}
                    onChange={(e) => {
                      setFormData((prev) => ({ ...prev, serverId: e.target.value }));
                      setHasUnsavedChanges(true);
                    }}
                    placeholder="apple-imessages"
                    disabled={!!editingServer}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => {
                      setFormData((prev) => ({ ...prev, name: e.target.value }));
                      setHasUnsavedChanges(true);
                    }}
                    placeholder="Apple iMessages"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => {
                      setFormData((prev) => ({ ...prev, description: e.target.value }));
                      setHasUnsavedChanges(true);
                    }}
                    placeholder="MCP server description..."
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Icon</Label>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        size="sm"
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        Upload
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,.svg"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                      {formData.iconUrl && (
                        <img
                          src={formData.iconUrl}
                          alt="Icon preview"
                          className="h-8 w-8 rounded border object-cover"
                        />
                      )}
                    </div>
                    <Input
                      value={formData.iconUrl}
                      onChange={(e) => {
                        setFormData((prev) => ({ ...prev, iconUrl: e.target.value }));
                        setHasUnsavedChanges(true);
                      }}
                      placeholder="Or paste image URL"
                      className="text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="command">Command</Label>
                  <Input
                    id="command"
                    value={formData.command}
                    onChange={(e) => {
                      setFormData((prev) => ({ ...prev, command: e.target.value }));
                      setHasUnsavedChanges(true);
                    }}
                    placeholder="npx"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="args">Arguments</Label>
                  <Input
                    id="args"
                    value={formData.args}
                    onChange={(e) => {
                      setFormData((prev) => ({ ...prev, args: e.target.value }));
                      setHasUnsavedChanges(true);
                    }}
                    placeholder="-y, @foxychat-mcp/apple-imessages"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="url">URL</Label>
                  <Input
                    id="url"
                    value={formData.url}
                    onChange={(e) => {
                      setFormData((prev) => ({ ...prev, url: e.target.value }));
                      setHasUnsavedChanges(true);
                    }}
                    placeholder="https://api.example.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="apiKey">API Key</Label>
                  <Input
                    id="apiKey"
                    type="password"
                    value={formData.apiKey}
                    onChange={(e) => {
                      setFormData((prev) => ({ ...prev, apiKey: e.target.value }));
                      setHasUnsavedChanges(true);
                    }}
                    placeholder="Enter API key if required"
                  />
                </div>
              </div>

              {/* Right Panel - JSON Configuration */}
              <div className="flex-1 space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">JSON Configuration</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const success = parseJsonToForm(jsonConfigView, false);
                        if (success) {
                          toast({
                            title: "Success",
                            description: "JSON configuration parsed successfully",
                          });
                        } else {
                          toast({
                            title: "Error",
                            description: "Invalid JSON format",
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      <FileJson className="mr-2 h-4 w-4" />
                      Parse JSON
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(jsonConfigView);
                        toast({
                          title: "Success",
                          description: "JSON copied to clipboard",
                        });
                      }}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copy
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={jsonConfigView}
                  onChange={(e) => {
                    setJsonConfigView(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  onBlur={() => {
                    // Auto-parse JSON on blur (silent mode)
                    parseJsonToForm(jsonConfigView, true);
                  }}
                  placeholder="Paste JSON configuration here or edit the generated config"
                  className="h-[500px] resize-none font-mono text-sm"
                />
                <p className="text-xs text-gray-500">
                  JSON automatically syncs when you click outside. Use "Parse JSON" for manual
                  parsing.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  if (hasUnsavedChanges) {
                    setShowConfirmDialog(true);
                  } else {
                    setDialogOpen(false);
                    resetForm();
                  }
                }}
              >
                Cancel
              </Button>
              <Button onClick={saveServer}>{editingServer ? "Update" : "Create"} Server</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>App MCP Marketplace</CardTitle>
              <CardDescription>View and manage App MCP available for users</CardDescription>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Cpu className="h-4 w-4" />
              <span>{servers.length} total</span>
              <span className="text-gray-400">•</span>
              <span>{servers.length} available</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>App MCP</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Config</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32">
                    <div className="flex flex-col items-center justify-center gap-3 py-8">
                      <div className="rounded-full bg-gray-100 p-3">
                        <Cpu className="h-6 w-6 text-gray-400" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-medium text-gray-900">No App MCP configured</p>
                        <p className="mt-1 text-sm text-gray-500">
                          Get started by adding your first App MCP
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => {
                            resetForm();
                            setDialogOpen(true);
                          }}
                          size="sm"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Add App MCP
                        </Button>
                        <Button onClick={() => setJsonImportOpen(true)} size="sm" variant="outline">
                          <FileJson className="mr-2 h-4 w-4" />
                          Import JSON
                        </Button>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                servers.map((server) => (
                  <TableRow key={server.id} className="hover:bg-gray-50">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {server.iconUrl ? (
                          <img
                            src={server.iconUrl}
                            alt={server.name}
                            className="h-10 w-10 rounded-lg border border-gray-200 object-cover shadow-sm"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-orange-400 to-pink-500 text-sm font-semibold text-white shadow-sm">
                            {server.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-gray-900">{server.name}</div>
                          <div className="font-mono text-xs text-gray-500">{server.id}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-xs">
                        <p className="line-clamp-2 text-sm text-gray-600">{server.description}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {server.config.command && (
                          <div className="inline-flex items-center gap-1">
                            <span className="rounded-md bg-gray-100 px-2 py-1 font-mono text-xs text-gray-700">
                              {server.config.command}
                            </span>
                          </div>
                        )}
                        {server.config.args && server.config.args.length > 0 && (
                          <div className="font-mono text-xs text-gray-500">
                            {server.config.args.join(" ")}
                          </div>
                        )}
                        {server.config.url && (
                          <div className="inline-flex items-center gap-1">
                            <span className="rounded-md bg-blue-100 px-2 py-1 font-mono text-xs text-blue-700">
                              URL: {server.config.url}
                            </span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="default"
                        className="bg-green-100 text-green-800 hover:bg-green-200"
                      >
                        Available
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(server.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyConfig(server)}
                          className="h-8 w-8 p-0 text-gray-500 hover:text-gray-700"
                          title="Copy configuration"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(server)}
                          className="h-8 w-8 p-0 text-gray-500 hover:text-gray-700"
                          title="Edit App MCP"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-gray-500 hover:text-red-600"
                              title="Delete App MCP"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete App MCP</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{server.name}"? This action cannot
                                be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteServer(server.id)}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Unsaved changes confirmation dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to close without saving?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowConfirmDialog(false)}>
              Continue Editing
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowConfirmDialog(false);
                setDialogOpen(false);
                resetForm();
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
