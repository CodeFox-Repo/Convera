import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface MemoryItem {
  id: string;
  type: string;
  content: string;
  timestamp: number;
  tags: string[];
  entityData?: any;
  relationData?: any;
  observations?: string[];
}

export function MemoryManager() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  // Load memories from API on initial render
  useEffect(() => {
    loadMemories();
  }, []);

  const loadMemories = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("http://localhost:38000/api/memory");
      if (!response.ok) {
        throw new Error("Failed to fetch memory data");
      }
      
      const data = await response.json();
      if (data.status === "success") {
        // Ensure memories is always an array
        const memoriesData = Array.isArray(data.memories) ? data.memories : [];
        setMemories(memoriesData);
      } else {
        throw new Error(data.message || "Failed to fetch memory data");
      }
    } catch (error) {
      console.error("Error loading memories:", error);
      toast.error("Failed to load memory data");
      // Set memories to empty array in case of error
      setMemories([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearMemories = async () => {
    try {
      const response = await fetch("http://localhost:38000/api/memory", {
        method: "DELETE",
      });
      
      if (!response.ok) {
        throw new Error("Failed to clear memory");
      }
      
      const data = await response.json();
      if (data.status === "success") {
        setMemories([]);
        toast.success("All memories cleared");
      } else {
        throw new Error(data.message || "Failed to clear memory");
      }
    } catch (error) {
      console.error("Error clearing memories:", error);
      toast.error("Failed to clear memory data");
    } finally {
      setIsConfirmingClear(false);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    setIsDeleting(id);
    try {
      const response = await fetch(`http://localhost:38000/api/memory/${id}`, {
        method: "DELETE",
      });
      
      if (!response.ok) {
        throw new Error("Failed to delete memory item");
      }
      
      const data = await response.json();
      if (data.status === "success") {
        // Ensure memories is an array before filtering
        if (Array.isArray(memories)) {
          setMemories(memories.filter(memory => memory.id !== id));
        }
        toast.success("Memory item deleted");
      } else {
        throw new Error(data.message || "Failed to delete memory item");
      }
    } catch (error) {
      console.error("Error deleting memory:", error);
      toast.error("Failed to delete memory item");
    } finally {
      setIsDeleting(null);
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const getTypeLabel = (type: string) => {
    // Just capitalize the first letter of any type
    if (typeof type === 'string') {
      return type.charAt(0).toUpperCase() + type.slice(1);
    }
    return String(type);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Memory Manager</h2>
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadMemories}
            className="flex items-center gap-1"
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setIsConfirmingClear(true)}
            className="flex items-center gap-1"
            disabled={memories.length === 0 || isLoading}
          >
            <Trash2 className="h-4 w-4" />
            Clear All
          </Button>
        </div>
      </div>

      {isLoading && memories.length === 0 ? (
        <div className="flex justify-center py-12">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            <p className="mt-4 text-muted-foreground">Loading memory data...</p>
          </div>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div className="text-lg font-semibold">All Memories</div>
              <Badge variant="outline">{memories.length} items</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <MemoryList 
              memories={memories} 
              onDelete={handleDeleteMemory} 
              formatTimestamp={formatTimestamp}
              getTypeLabel={getTypeLabel}
              isDeleting={isDeleting}
            />
          </CardContent>
        </Card>
      )}

      <AlertDialog open={isConfirmingClear} onOpenChange={setIsConfirmingClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear All Memories</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all stored memories from the Memory-MCP server. 
              The AI will no longer remember any previous conversations or information about you. Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearMemories}>
              Yes, Clear All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface MemoryListProps {
  memories: MemoryItem[];
  onDelete: (id: string) => void;
  formatTimestamp: (timestamp: number) => string;
  getTypeLabel: (type: string) => string;
  isDeleting: string | null;
}

function MemoryList({ memories, onDelete, formatTimestamp, getTypeLabel, isDeleting }: MemoryListProps) {
  if (memories.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No memories found.
      </div>
    );
  }

  // Function to format memory content for display
  const formatContent = (memory: MemoryItem) => {
    // Handle entity data
    if (memory.tags?.includes("entity")) {
      try {
        const entityData = (memory as any).entityData;
        if (entityData) {
          // Format entity data as key-value pairs
          return (
            <div className="bg-muted p-2 rounded text-xs">
              <div className="font-semibold mb-1">Entity Data:</div>
              {Object.entries(entityData).map(([key, value]) => (
                <div key={key} className="flex flex-wrap">
                  <span className="font-semibold mr-2">{key}:</span>
                  <span className="break-all">{Array.isArray(value) 
                    ? value.join(", ") 
                    : typeof value === 'object' && value !== null
                      ? JSON.stringify(value) 
                      : String(value)}</span>
                </div>
              ))}
            </div>
          );
        }
      } catch (error) {
        console.error("Error parsing entity data:", error);
      }
    }
    
    // Handle relation data
    if (memory.tags?.includes("relation")) {
      try {
        const relationData = (memory as any).relationData;
        if (relationData) {
          return (
            <div className="bg-muted p-2 rounded text-xs">
              <div className="font-semibold mb-1">Relation:</div>
              <div className="flex items-center gap-2 mb-1">
                <Badge>{relationData.from}</Badge>
                <span className="font-medium">{relationData.relationType}</span>
                <Badge>{relationData.to}</Badge>
              </div>
              {Object.entries(relationData)
                .filter(([key]) => !['from', 'to', 'relationType'].includes(key))
                .map(([key, value]) => (
                  <div key={key} className="flex flex-wrap">
                    <span className="font-semibold mr-2">{key}:</span>
                    <span className="break-all">{typeof value === 'object' && value !== null 
                      ? JSON.stringify(value) 
                      : String(value)}</span>
                  </div>
                ))}
            </div>
          );
        }
      } catch (error) {
        console.error("Error parsing relation data:", error);
      }
    }
    
    // Special handling for observations
    if (memory.content.startsWith("Entity:") || memory.content.startsWith("Relation:")) {
      return null; // Don't show prefixed content if we're displaying rich entity data
    }
    
    // Default formatting for regular content
    return <p className="text-sm break-words">{memory.content}</p>;
  };

  return (
    <ScrollArea className="h-[500px]">
      <div className="space-y-4">
        {memories.map((memory) => (
          <Card key={memory.id} className="shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <Badge variant="outline">{getTypeLabel(memory.type)}</Badge>
                  <div className="text-xs text-muted-foreground mt-1">
                    {formatTimestamp(memory.timestamp)}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(memory.id)}
                  className="h-6 w-6"
                  title="Delete memory"
                  disabled={isDeleting === memory.id}
                >
                  {isDeleting === memory.id ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {formatContent(memory)}
              {memory.tags && memory.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {memory.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </ScrollArea>
  );
} 