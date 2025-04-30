import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
import MemoryService from "@/services/MemoryService";

interface MemoryItem {
  id: string;
  type: string;
  content: string;
  timestamp: number;
  tags: string[];
}

export function MemoryManager() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const memoryService = MemoryService.getInstance();

  // Load memories on initial render
  useEffect(() => {
    loadMemories();
  }, []);

  const loadMemories = () => {
    const allMemories = memoryService.getAllMemory();
    setMemories(allMemories);
  };

  const handleClearMemories = () => {
    memoryService.clearAllMemory();
    setMemories([]);
    setIsConfirmingClear(false);
  };

  const handleDeleteMemory = (id: string) => {
    memoryService.deleteMemoryItem(id);
    loadMemories();
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const getMemoriesByType = (type: string) => {
    return memories.filter((memory) => memory.type === type);
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "user_info":
        return "User Information";
      case "conversation_context":
        return "Conversation Context";
      case "previous_interaction":
        return "Previous Interactions";
      case "code_context":
        return "Code Context";
      default:
        return type;
    }
  };

  const getTypeDescription = (type: string) => {
    switch (type) {
      case "user_info":
        return "Personal details and preferences remembered about the user";
      case "conversation_context":
        return "Topics and themes from past conversations";
      case "previous_interaction":
        return "Questions asked and answers provided in previous chats";
      case "code_context":
        return "Code snippets and programming concepts discussed";
      default:
        return "";
    }
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
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setIsConfirmingClear(true)}
            className="flex items-center gap-1"
            disabled={memories.length === 0}
          >
            <Trash2 className="h-4 w-4" />
            Clear All
          </Button>
        </div>
      </div>

      <Tabs defaultValue="all">
        <TabsList className="mb-4">
          <TabsTrigger value="all">
            All <Badge variant="outline" className="ml-2">{memories.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="user_info">
            User Info <Badge variant="outline" className="ml-2">{getMemoriesByType("user_info").length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="conversation_context">
            Context <Badge variant="outline" className="ml-2">{getMemoriesByType("conversation_context").length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="previous_interaction">
            Interactions <Badge variant="outline" className="ml-2">{getMemoriesByType("previous_interaction").length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="code_context">
            Code <Badge variant="outline" className="ml-2">{getMemoriesByType("code_context").length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <MemoryList 
            memories={memories} 
            onDelete={handleDeleteMemory} 
            formatTimestamp={formatTimestamp}
            getTypeLabel={getTypeLabel} 
          />
        </TabsContent>

        <TabsContent value="user_info">
          <Card>
            <CardHeader>
              <CardTitle>User Information</CardTitle>
              <CardDescription>
                Personal details and preferences remembered about you
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MemoryList 
                memories={getMemoriesByType("user_info")} 
                onDelete={handleDeleteMemory} 
                formatTimestamp={formatTimestamp}
                getTypeLabel={getTypeLabel} 
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conversation_context">
          <Card>
            <CardHeader>
              <CardTitle>Conversation Context</CardTitle>
              <CardDescription>
                Topics and themes from past conversations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MemoryList 
                memories={getMemoriesByType("conversation_context")} 
                onDelete={handleDeleteMemory} 
                formatTimestamp={formatTimestamp}
                getTypeLabel={getTypeLabel} 
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="previous_interaction">
          <Card>
            <CardHeader>
              <CardTitle>Previous Interactions</CardTitle>
              <CardDescription>
                Questions asked and answers provided in previous chats
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MemoryList 
                memories={getMemoriesByType("previous_interaction")} 
                onDelete={handleDeleteMemory} 
                formatTimestamp={formatTimestamp}
                getTypeLabel={getTypeLabel} 
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="code_context">
          <Card>
            <CardHeader>
              <CardTitle>Code Context</CardTitle>
              <CardDescription>
                Code snippets and programming concepts discussed
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MemoryList 
                memories={getMemoriesByType("code_context")} 
                onDelete={handleDeleteMemory} 
                formatTimestamp={formatTimestamp}
                getTypeLabel={getTypeLabel} 
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={isConfirmingClear} onOpenChange={setIsConfirmingClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear All Memories</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all stored memories. The AI will no longer 
              remember any previous conversations or information about you. Are you sure?
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
}

function MemoryList({ memories, onDelete, formatTimestamp, getTypeLabel }: MemoryListProps) {
  if (memories.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No memories found in this category.
      </div>
    );
  }

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
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{memory.content}</p>
              {memory.tags.length > 0 && (
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