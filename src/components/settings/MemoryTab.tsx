import React, { useState, useEffect } from "react";
import { MemorySettings } from "@/types/settings";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MemoryManager } from "./MemoryManager";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RefreshCw, Server } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_MEMORY_INSTRUCTIONS = `While conversing with the user, be attentive to any new information that falls into these categories:
a) Basic Identity (age, gender, location, job title, education level, etc.)
b) Behaviors (interests, habits, etc.)
c) Preferences (communication style, preferred language, etc.)
d) Goals (goals, targets, aspirations, etc.)
e) Relationships (personal and professional relationships up to 3 degrees of separation)`;

interface MemoryTabProps {
  settings: MemorySettings;
  onMemorySettingChange: (field: string, value: any) => void;
}

interface ServerStatus {
  id: string;
  name: string;
  enabled: boolean;
  running: boolean;
}

export function MemoryTab({ settings, onMemorySettingChange }: MemoryTabProps) {
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [promptInstructions, setPromptInstructions] = useState(
    settings.promptInstructions || DEFAULT_MEMORY_INSTRUCTIONS
  );
  const [memoryServer, setMemoryServer] = useState<ServerStatus | null>(null);
  const [isLoadingServerStatus, setIsLoadingServerStatus] = useState(false);
  const [isTogglingServer, setIsTogglingServer] = useState(false);

  const MEMORY_SERVER_ID = "Memory-MCP"; // Server ID for Memory-MCP

  // Fetch MCP server configurations and status
  const fetchMemoryServerStatus = async () => {
    setIsLoadingServerStatus(true);
    try {
      const res = await fetch("http://localhost:38000/api/mcp/configurations");
      if (!res.ok) throw new Error("Failed to fetch MCP configurations");
      
      const data = await res.json();
      const configs = data.configurations || {};
      
      // Find the Memory-MCP server config
      const memoryConfig = configs[MEMORY_SERVER_ID];
      
      // Also fetch running status
      const serverRes = await fetch("http://localhost:38000/api/mcp/servers");
      if (!serverRes.ok) throw new Error("Failed to fetch server status");
      
      const serverData = await serverRes.json();
      const servers = serverData.servers || [];
      
      // Find memory server in the list
      const memoryServerStatus = servers.find((s: any) => s.id === MEMORY_SERVER_ID);
      
      if (memoryConfig || memoryServerStatus) {
        setMemoryServer({
          id: MEMORY_SERVER_ID,
          name: memoryConfig?.name || memoryServerStatus?.name || "Memory MCP",
          enabled: memoryConfig?.enabled || false,
          running: memoryServerStatus?.running || false
        });
      }
    } catch (err) {
      console.error("Error fetching Memory MCP status:", err);
      toast.error("Failed to load Memory MCP status");
    } finally {
      setIsLoadingServerStatus(false);
    }
  };

  // Toggle server enabled state
  const toggleServerEnabled = async () => {
    if (!memoryServer) return;
    
    setIsTogglingServer(true);
    try {
      // Update the configuration enabled state
      const configRes = await fetch(`http://localhost:38000/api/mcp/configurations/${MEMORY_SERVER_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...memoryServer,
          enabled: !memoryServer.enabled
        }),
      });
      
      if (!configRes.ok) {
        throw new Error("Failed to update Memory MCP configuration");
      }
      
      // If enabling, also start the server
      if (!memoryServer.enabled) {
        const startRes = await fetch(`http://localhost:38000/api/mcp/servers/${MEMORY_SERVER_ID}/start`, {
          method: "POST",
        });
        
        if (!startRes.ok) {
          throw new Error("Failed to start Memory MCP server");
        }
        
        toast.success("Memory MCP server enabled");
      } else {
        // If disabling, stop the server
        const stopRes = await fetch(`http://localhost:38000/api/mcp/servers/${MEMORY_SERVER_ID}/stop`, {
          method: "POST",
        });
        
        if (!stopRes.ok) {
          console.warn("Warning: Failed to stop Memory MCP server");
        }
        
        toast.success("Memory MCP server disabled");
      }
      
      // Refresh status after action
      setTimeout(fetchMemoryServerStatus, 1000);
    } catch (err) {
      console.error("Error toggling Memory MCP server:", err);
      toast.error(`Failed to ${memoryServer.enabled ? "disable" : "enable"} Memory MCP server`);
    } finally {
      setIsTogglingServer(false);
    }
  };

  // Load server status on component mount
  useEffect(() => {
    fetchMemoryServerStatus();
    
    // Refresh every 10 seconds
    const intervalId = setInterval(fetchMemoryServerStatus, 10000);
    
    return () => {
      clearInterval(intervalId);
    };
  }, []);

  const handleSavePromptInstructions = () => {
    onMemorySettingChange("promptInstructions", promptInstructions);
    setIsEditingPrompt(false);
  };

  const handleResetPromptInstructions = () => {
    setPromptInstructions(DEFAULT_MEMORY_INSTRUCTIONS);
    onMemorySettingChange("promptInstructions", DEFAULT_MEMORY_INSTRUCTIONS);
  };

  return (
    <Tabs defaultValue="settings" className="space-y-6">
      <TabsList>
        <TabsTrigger value="settings">Memory Settings</TabsTrigger>
        <TabsTrigger value="prompt">Memory Prompt</TabsTrigger>
        <TabsTrigger value="manager">Memory Manager</TabsTrigger>
      </TabsList>
      
      <TabsContent value="settings" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Memory Settings</CardTitle>
            <CardDescription>
              Configure what the agent should remember during conversations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">


            {/* Server Control Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Enable Memory</h3>
              
              <div className="rounded-md border p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Server className="h-6 w-6 text-primary" />
                    <div>
                      <h4 className="font-medium">{memoryServer?.name || "Memory MCP"}</h4>
                      <p className="text-muted-foreground text-sm">
                        Persistent memory service
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-end text-sm">
                      <div className="flex items-center gap-1">
                        <span className={`inline-block w-2 h-2 rounded-full ${memoryServer?.running ? "bg-green-500" : "bg-red-500"}`}></span>
                        <span className={memoryServer?.running ? "text-green-500" : "text-red-500"}>
                          {isLoadingServerStatus ? "Loading..." : (memoryServer?.running ? "Running" : "Stopped")}
                        </span>
                      </div>
                    </div>
                    
                    <Switch
                      id="enable-server"
                      checked={memoryServer?.enabled || false}
                      onCheckedChange={toggleServerEnabled}
                      disabled={isTogglingServer || isLoadingServerStatus}
                    />
                  </div>
                </div>
                
                <p className="text-muted-foreground text-xs mt-3">
                  When enabled, the Memory MCP server will start automatically and provide persistent memory across sessions.
                </p>
              </div>
            </div>

            <div className="my-6 border-t" />

            <div className="space-y-4">
              <h3 className="text-lg font-medium">Memory Configuration</h3>

              <div className="space-y-2">
                <Label htmlFor="max-memory-items">Maximum Memory Items</Label>
                <p className="text-muted-foreground text-sm mb-2">
                  Limit how many pieces of information the agent should remember
                </p>
                <div className="flex items-center gap-4">
                  <Slider
                    id="max-memory-items"
                    value={[settings.maxMemoryItems]}
                    min={10}
                    max={500}
                    step={10}
                    onValueChange={(values) =>
                      onMemorySettingChange("maxMemoryItems", values[0])
                    }
                    disabled={!settings.enabled}
                    className="flex-1"
                  />
                  <div className="w-12 text-center">
                    {settings.maxMemoryItems}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      
      <TabsContent value="prompt">
        <Card>
          <CardHeader>
            <CardTitle>Memory Prompt Instructions</CardTitle>
            <CardDescription>
              Customize the system prompt instructions that tell the agent when to remember information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="memory-prompt" className="text-base font-medium">
                  Instructions for the AI on what to remember
                </Label>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleResetPromptInstructions}
                    className="flex items-center gap-1"
                    title="Reset to default instructions"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Reset
                  </Button>
                  {isEditingPrompt ? (
                    <Button 
                      size="sm" 
                      onClick={handleSavePromptInstructions}
                    >
                      Save
                    </Button>
                  ) : (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setIsEditingPrompt(true)}
                    >
                      Edit
                    </Button>
                  )}
                </div>
              </div>
              
              <p className="text-muted-foreground text-sm">
                These instructions are included in the system prompt and tell the agent what information to pay attention to and remember during conversations.
              </p>
              
              <div className="mt-4">
                {isEditingPrompt ? (
                  <Textarea
                    id="memory-prompt"
                    placeholder="Enter memory prompt instructions..."
                    value={promptInstructions}
                    onChange={(e) => setPromptInstructions(e.target.value)}
                    className="h-[300px] font-mono text-sm"
                  />
                ) : (
                  <div className="bg-muted/50 border rounded-md p-4 whitespace-pre-wrap font-mono text-sm">
                    {promptInstructions || DEFAULT_MEMORY_INSTRUCTIONS}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      
      <TabsContent value="manager">
        <Card>
          <CardHeader>
            <CardTitle>Memory Manager</CardTitle>
            <CardDescription>
              View and manage all information that the agent has remembered
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MemoryManager />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
} 