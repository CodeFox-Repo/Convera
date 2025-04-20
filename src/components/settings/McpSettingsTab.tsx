import React, { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { MCPServerConfig, ToolDefinition } from "@/server/mcp/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type McpSettingsTabProps = {
  mcpServerConfigs: Record<string, MCPServerConfig>;
  mcpServerTools: Record<string, ToolDefinition[]>;
  loadingMcpConfigs: boolean;
  loadingMcpTools: Record<string, boolean>;
  activeTab: string;
  onMcpConfigChange: (
    id: string,
    field: keyof MCPServerConfig,
    value: string | number | boolean | string[] | Record<string, string> | undefined
  ) => void;
  onSaveMcpConfig: (id: string) => void;
  onFetchMcpServerTools: (id: string) => void;
};

export function McpSettingsTab({
  mcpServerConfigs,
  mcpServerTools,
  loadingMcpConfigs,
  loadingMcpTools,
  activeTab,
  onMcpConfigChange,
  onSaveMcpConfig,
  onFetchMcpServerTools,
}: McpSettingsTabProps) {
  const [newArguments, setNewArguments] = useState<Record<string, string>>({});
  const [newEnvKey, setNewEnvKey] = useState<Record<string, string>>({});
  const [newEnvValue, setNewEnvValue] = useState<Record<string, string>>({});
  const [showNewArgInput, setShowNewArgInput] = useState<Record<string, boolean>>({});
  const [showNewEnvInput, setShowNewEnvInput] = useState<Record<string, boolean>>({});
  const [editingEnvKeys, setEditingEnvKeys] = useState<Record<string, Record<string, string>>>({});

  // When the tab becomes active, refresh the tools data
  useEffect(() => {
    // Only run once when the tab becomes active
    if (activeTab === "mcpsettings") {
      // Get enabled server IDs
      const enabledServerIds = Object.entries(mcpServerConfigs)
        .filter(([, config]) => config.enabled)
        .map(([id]) => id);
        
      // Fetch tools for each enabled server
      enabledServerIds.forEach(id => {
        onFetchMcpServerTools(id);
      });
    }
  }, [activeTab]); // Remove mcpServerConfigs and onFetchMcpServerTools from dependencies

  // Handle adding a command line argument
  const handleAddArgument = (id: string) => {
    if (!newArguments[id] || newArguments[id].trim() === '') return;
    
    const config = mcpServerConfigs[id];
    const currentArgs = Array.isArray(config.args) ? [...config.args] : [];
    
    onMcpConfigChange(id, 'args', [...currentArgs, newArguments[id]]);
    
    // Reset input and hide the input field
    setNewArguments(prev => ({ ...prev, [id]: '' }));
    setShowNewArgInput(prev => ({ ...prev, [id]: false }));
  };

  // Handle showing the input field for a new argument
  const toggleShowNewArgInput = (id: string) => {
    setShowNewArgInput(prev => ({ 
      ...prev, 
      [id]: !prev[id] 
    }));
    
    // Reset input when toggling
    if (showNewArgInput[id]) {
      setNewArguments(prev => ({ ...prev, [id]: '' }));
    }
  };

  // Handle removing a command line argument
  const handleRemoveArgument = (id: string, index: number) => {
    const config = mcpServerConfigs[id];
    if (!Array.isArray(config.args)) return;
    
    const newArgs = [...config.args];
    newArgs.splice(index, 1);
    onMcpConfigChange(id, 'args', newArgs);
  };

  // Handle adding an environment variable
  const handleAddEnvVar = (id: string) => {
    if (!newEnvKey[id] || newEnvKey[id].trim() === '') return;
    
    const config = mcpServerConfigs[id];
    const currentEnv = config.env ? { ...config.env } : {};
    
    currentEnv[newEnvKey[id]] = newEnvValue[id] || '';
    onMcpConfigChange(id, 'env', currentEnv);
    
    // Reset input fields and hide them
    setNewEnvKey(prev => ({ ...prev, [id]: '' }));
    setNewEnvValue(prev => ({ ...prev, [id]: '' }));
    setShowNewEnvInput(prev => ({ ...prev, [id]: false }));
  };

  // Handle showing the input fields for a new environment variable
  const toggleShowNewEnvInput = (id: string) => {
    setShowNewEnvInput(prev => ({ 
      ...prev, 
      [id]: !prev[id] 
    }));
    
    // Reset inputs when toggling
    if (showNewEnvInput[id]) {
      setNewEnvKey(prev => ({ ...prev, [id]: '' }));
      setNewEnvValue(prev => ({ ...prev, [id]: '' }));
    }
  };

  // Handle removing an environment variable
  const handleRemoveEnvVar = (id: string, key: string) => {
    const config = mcpServerConfigs[id];
    if (!config.env) return;
    
    const newEnv = { ...config.env };
    delete newEnv[key];
    onMcpConfigChange(id, 'env', newEnv);
  };

  // Update environment variable value
  const handleUpdateEnvVar = (id: string, key: string, value: string) => {
    const config = mcpServerConfigs[id];
    if (!config.env) return;
    
    const newEnv = { ...config.env };
    newEnv[key] = value;
    onMcpConfigChange(id, 'env', newEnv);
  };

  // Add a function to handle starting to edit an environment variable key
  const startEditingEnvKey = (serverId: string, key: string) => {
    setEditingEnvKeys(prev => ({
      ...prev,
      [serverId]: {
        ...(prev[serverId] || {}),
        [key]: key
      }
    }));
  };

  // Add a function to handle updating an environment variable key
  const handleUpdateEnvKey = (serverId: string, oldKey: string, newKey: string) => {
    if (!newKey.trim() || oldKey === newKey) {
      // Reset editing state if key is empty or unchanged
      setEditingEnvKeys(prev => {
        const result = { ...prev };
        if (result[serverId]) {
          delete result[serverId][oldKey];
        }
        return result;
      });
      return;
    }

    const config = mcpServerConfigs[serverId];
    if (!config.env) return;

    // Create a new env object with updated key
    const newEnv = { ...config.env };
    const value = newEnv[oldKey];
    
    // Delete the old key and add the new one with the same value
    delete newEnv[oldKey];
    newEnv[newKey] = value;
    
    // Update the config
    onMcpConfigChange(serverId, 'env', newEnv);
    
    // Reset editing state
    setEditingEnvKeys(prev => {
      const result = { ...prev };
      if (result[serverId]) {
        delete result[serverId][oldKey];
      }
      return result;
    });
  };

  return (
    <Card className="bg-card text-foreground border-none">
      <CardHeader>
        <CardTitle>MCP Settings</CardTitle>
        <CardDescription className="text-muted-foreground">
          Configure your installed and discovered MCP servers
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="custom-scrollbar max-h-[calc(100vh-300px)] overflow-y-auto pr-2">
          {loadingMcpConfigs ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
            </div>
          ) : Object.keys(mcpServerConfigs).length === 0 ? (
            <p className="text-muted-foreground">
              No MCP servers configured or found.
            </p>
          ) : (
            <div className="space-y-6">
              {Object.entries(mcpServerConfigs).map(([id, config]) => (
                <div key={id}>
                  <h3 className="text-foreground mb-2 text-lg font-medium">
                    {config.name || id}
                  </h3>
                  <div className="bg-secondary space-y-4 rounded-md p-4">
                    {/* Enabled Switch */}
                    <div className="flex items-center justify-between">
                      <Label
                        htmlFor={`mcp-enabled-${id}`}
                        className="text-foreground text-sm"
                      >
                        Enabled
                      </Label>
                      <Switch
                        id={`mcp-enabled-${id}`}
                        checked={config.enabled}
                        onCheckedChange={(checked) =>
                          onMcpConfigChange(id, "enabled", checked)
                        }
                        className="data-[state=unchecked]:bg-secondary/80 data-[state=checked]:bg-green-600"
                      />
                    </div>

                    {/* Name Input */}
                    <div className="grid grid-cols-3 items-center gap-4">
                      <Label
                        htmlFor={`mcp-name-${id}`}
                        className="text-foreground text-sm"
                      >
                        Name
                      </Label>
                      <Input
                        id={`mcp-name-${id}`}
                        className="border-border bg-secondary/80 text-foreground col-span-2"
                        placeholder="Server Name"
                        value={config.name || ""}
                        onChange={(e) =>
                          onMcpConfigChange(id, "name", e.target.value)
                        }
                      />
                    </div>

                    {/* URL (Remote) */}
                    {config.url !== undefined && (
                      <div className="grid grid-cols-3 items-center gap-4">
                        <Label
                          htmlFor={`mcp-url-${id}`}
                          className="text-foreground text-sm"
                        >
                          Server URL
                        </Label>
                        <Input
                          id={`mcp-url-${id}`}
                          className="border-border bg-secondary/80 text-foreground col-span-2"
                          placeholder="http://example.com/mcp"
                          value={config.url || ""}
                          onChange={(e) =>
                            onMcpConfigChange(id, "url", e.target.value)
                          }
                        />
                      </div>
                    )}

                    {/* Command Line Configuration (Local) */}
                    {config.command !== undefined && (
                      <Accordion type="single" collapsible className="w-full border-border rounded-md">
                        <AccordionItem value="command-config" className="border-none">
                          <AccordionTrigger className="text-foreground text-sm pt-3">
                            Command Line Configuration
                          </AccordionTrigger>
                          <AccordionContent className="px-4 pb-3 pt-1">
                            <div className="space-y-4">
                              {/* Command */}
                              <div className="grid grid-cols-3 items-center gap-4">
                                <Label
                                  htmlFor={`mcp-command-${id}`}
                                  className="text-foreground text-sm"
                                >
                                  Command
                                </Label>
                                <Input
                                  id={`mcp-command-${id}`}
                                  className="border-border bg-secondary/80 text-foreground col-span-2"
                                  placeholder="node ./server.js"
                                  value={config.command || ""}
                                  onChange={(e) =>
                                    onMcpConfigChange(id, "command", e.target.value)
                                  }
                                />
                              </div>

                              {/* Command Arguments */}
                              <div className="space-y-2">
                                <div className="flex items-center justify-between mb-1">
                                  <Label className="text-foreground text-sm">
                                    Arguments
                                  </Label>
                                  {!showNewArgInput[id] && (
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => toggleShowNewArgInput(id)}
                                      className="h-7 px-2 bg-secondary/80 text-foreground hover:bg-secondary/60"
                                    >
                                      <Plus className="h-4 w-4 mr-1" />
                                      Add Argument
                                    </Button>
                                  )}
                                </div>
                                
                                <div className="space-y-2">
                                  {/* List of existing arguments */}
                                  {Array.isArray(config.args) && config.args.length > 0 && (
                                    <div className="space-y-2 mb-2">
                                      {config.args.map((arg, index) => (
                                        <div key={`${id}-arg-${index}`} className="flex items-center gap-2">
                                          <Input
                                            className="border-border bg-secondary/80 text-foreground flex-1"
                                            value={arg}
                                            onChange={(e) => {
                                              const newArgs = [...config.args as string[]];
                                              newArgs[index] = e.target.value;
                                              onMcpConfigChange(id, "args", newArgs);
                                            }}
                                          />
                                          <Button
                                            variant="secondary"
                                            size="icon"
                                            onClick={() => handleRemoveArgument(id, index)}
                                            className="h-8 w-8"
                                          >
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                          </Button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  
                                  {/* Add new argument - only shown when Add button is clicked */}
                                  {showNewArgInput[id] && (
                                    <div className="flex flex-col gap-2">
                                      <div className="flex items-center gap-2">
                                        <Input
                                          className="border-border bg-secondary/80 text-foreground flex-1"
                                          placeholder="Enter new argument"
                                          value={newArguments[id] || ''}
                                          onChange={(e) => 
                                            setNewArguments(prev => ({ ...prev, [id]: e.target.value }))
                                          }
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              handleAddArgument(id);
                                            }
                                          }}
                                        />
                                        <Button
                                          variant="secondary"
                                          size="icon"
                                          onClick={() => toggleShowNewArgInput(id)}
                                          className="h-8 w-8"
                                        >
                                          <X className="h-4 w-4 text-muted-foreground" />
                                        </Button>
                                      </div>
                                      <div className="flex justify-end">
                                        <Button
                                          variant="secondary"
                                          size="sm"
                                          onClick={() => handleAddArgument(id)}
                                          className="bg-secondary/80 text-foreground hover:bg-secondary/60"
                                        >
                                          Add
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Environment Variables */}
                              <div className="space-y-2 pt-2 border-t border-secondary/30">
                                <div className="flex items-center justify-between mb-1">
                                  <Label className="text-foreground text-sm">
                                    Environment Variables
                                  </Label>
                                  {!showNewEnvInput[id] && (
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => toggleShowNewEnvInput(id)}
                                      className="h-7 px-2"
                                    >
                                      <Plus className="h-4 w-4 mr-1" />
                                      Add Environment Variable
                                    </Button>
                                  )}
                                </div>
                                
                                <div className="space-y-3">
                                  {/* List of existing env vars */}
                                  {config.env && Object.keys(config.env).length > 0 && (
                                    <div className="space-y-3 mb-3">
                                      {Object.entries(config.env).map(([key, value]) => (
                                        <div key={`${id}-env-${key}`} className="grid grid-cols-[1fr_1.5fr_auto] gap-2 items-center">
                                          <Input
                                            className="border-border bg-secondary/80 text-foreground"
                                            value={editingEnvKeys[id]?.[key] !== undefined ? editingEnvKeys[id][key] : key}
                                            onChange={(e) => {
                                              setEditingEnvKeys(prev => ({
                                                ...prev,
                                                [id]: {
                                                  ...(prev[id] || {}),
                                                  [key]: e.target.value
                                                }
                                              }));
                                            }}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') {
                                                handleUpdateEnvKey(id, key, editingEnvKeys[id]?.[key] || key);
                                                e.currentTarget.blur();
                                              } else if (e.key === 'Escape') {
                                                setEditingEnvKeys(prev => {
                                                  const result = { ...prev };
                                                  if (result[id]) {
                                                    delete result[id][key];
                                                  }
                                                  return result;
                                                });
                                                e.currentTarget.blur();
                                              }
                                            }}
                                            onBlur={() => {
                                              if (editingEnvKeys[id]?.[key] !== undefined) {
                                                handleUpdateEnvKey(id, key, editingEnvKeys[id][key]);
                                              }
                                            }}
                                          />
                                          <Input
                                            className="border-border bg-secondary/80 text-foreground w-full"
                                            value={value as string}
                                            onChange={(e) => 
                                              handleUpdateEnvVar(id, key, e.target.value)
                                            }
                                          />
                                          <Button
                                            variant="secondary"
                                            size="icon"
                                            onClick={() => handleRemoveEnvVar(id, key)}
                                            className="h-8 w-8"
                                          >
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                          </Button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  
                                  {/* Add new env var - only shown when Add button is clicked */}
                                  {showNewEnvInput[id] && (
                                    <div className="flex flex-col gap-2">
                                      <div className="grid grid-cols-[1fr_1.5fr_auto] gap-2 items-center">
                                        <Input
                                          className="border-border bg-secondary/80 text-foreground"
                                          placeholder="KEY"
                                          value={newEnvKey[id] || ''}
                                          onChange={(e) => 
                                            setNewEnvKey(prev => ({ ...prev, [id]: e.target.value.toUpperCase() }))
                                          }
                                        />
                                        <Input
                                          className="border-border bg-secondary/80 text-foreground w-full"
                                          placeholder="value"
                                          value={newEnvValue[id] || ''}
                                          onChange={(e) => 
                                            setNewEnvValue(prev => ({ ...prev, [id]: e.target.value }))
                                          }
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              handleAddEnvVar(id);
                                            }
                                          }}
                                        />
                                        <Button
                                          variant="secondary"
                                          size="icon"
                                          onClick={() => toggleShowNewEnvInput(id)}
                                          className="h-8 w-8"
                                        >
                                          <X className="h-4 w-4 text-muted-foreground" />
                                        </Button>
                                      </div>
                                      <div className="flex justify-end">
                                        <Button
                                          variant="secondary"
                                          size="sm"
                                          onClick={() => handleAddEnvVar(id)}
                                        >
                                          Add
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    )}

                    {/* API Key (Optional) */}
                    {config.apiKey !== undefined && (
                      <div className="grid grid-cols-3 items-center gap-4">
                        <Label
                          htmlFor={`mcp-apikey-${id}`}
                          className="text-foreground text-sm"
                        >
                          API Key
                        </Label>
                        <Input
                          id={`mcp-apikey-${id}`}
                          type="password"
                          className="border-border bg-secondary/80 text-foreground col-span-2"
                          placeholder="Optional API Key"
                          value={config.apiKey || ""}
                          onChange={(e) =>
                            onMcpConfigChange(id, "apiKey", e.target.value)
                          }
                        />
                      </div>
                    )}

                    {/* Description (Optional) */}
                    {config.description !== undefined && (
                      <div className="grid grid-cols-3 items-center gap-4">
                        <Label
                          htmlFor={`mcp-description-${id}`}
                          className="text-foreground text-sm"
                        >
                          Description
                        </Label>
                        <Input
                          id={`mcp-description-${id}`}
                          className="border-border bg-secondary/80 text-foreground col-span-2"
                          placeholder="Optional description"
                          value={config.description || ""}
                          onChange={(e) =>
                            onMcpConfigChange(
                              id,
                              "description",
                              e.target.value
                            )
                          }
                        />
                      </div>
                    )}

                    {/* Available Tools Section - Show only if server is enabled */}
                    {config.enabled && (
                      <div className="mt-4 border-t border-secondary/80 pt-4">
                        <Accordion type="single" collapsible className="w-full border-border rounded-md">
                          <AccordionItem value="available-tools" className="border-none">
                            <AccordionTrigger className="text-foreground text-sm pt-3 px-0">
                              Available Tools
                              {loadingMcpTools[id] && (
                                <Loader2 className="ml-2 h-3 w-3 animate-spin" />
                              )}
                            </AccordionTrigger>
                            <AccordionContent className="px-0 pb-3 pt-1">
                              {loadingMcpTools[id] ? (
                                <div className="flex items-center text-muted-foreground text-sm py-2">
                                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                  Loading tools...
                                </div>
                              ) : mcpServerTools[id]?.length ? (
                                <div className="space-y-2">
                                  {mcpServerTools[id].map((tool) => (
                                    <div
                                      key={tool.name}
                                      className="bg-secondary/80 rounded p-2"
                                    >
                                      <div className="font-medium text-sm">
                                        {tool.name}
                                      </div>
                                      <div className="text-muted-foreground text-xs mt-1">
                                        {tool.description}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-muted-foreground text-sm py-2">
                                  No tools available or server not started.
                                  {config.enabled && (
                                    <Button
                                      variant="link"
                                      size="sm"
                                      className="p-0 h-auto font-normal"
                                      onClick={() => onFetchMcpServerTools(id)}
                                    >
                                      Refresh
                                    </Button>
                                  )}
                                </div>
                              )}
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <Button
                        variant="secondary"
                        className="bg-secondary/80 text-foreground hover:bg-secondary/60"
                        onClick={() => onSaveMcpConfig(id)}
                      >
                        Save {config.name || "Server"} Settings
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
} 