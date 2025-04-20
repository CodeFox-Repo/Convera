import React, { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AgentsTab() {
  const [selectedToolNames, setSelectedToolNames] = useState<string[]>([]);
  const [availableToolNames, setAvailableToolNames] = useState<string[]>([]);
  const nameRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch("http://localhost:38000/api/tools")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.tools)) {
          setAvailableToolNames(data.tools);
        }
      })
      .catch((err) => console.error("Failed to fetch available tools", err));
  }, []);

  const handleSaveAgent = async () => {
    const name = nameRef.current?.value || "";
    const description = descRef.current?.value || "";
    const prompt = promptRef.current?.value || "";
    const toolNames = selectedToolNames;

    if (!name || !description || toolNames.length === 0) {
      toast.error("Please fill in all fields and select at least one tool");
      return;
    }

    const agentData = {
      id: Date.now().toString(),
      name,
      description,
      systemPrompt: (tools: string[]) =>
        `${prompt}\n\nAvailable tools: ${tools.join(", ")}`,
      toolNames,
    };

    try {
      const res = await fetch("http://localhost:38000/api/agents/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agentData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error || "Failed to save agent");
      }

      toast.success("Agent saved");

      // Reset form
      if (nameRef.current) nameRef.current.value = "";
      if (descRef.current) descRef.current.value = "";
      if (promptRef.current) promptRef.current.value = "";
      setSelectedToolNames([]);
    } catch (err) {
      console.error("Save agent error", err);
      toast.error("Failed to save agent");
    }
  };

  return (
    <Card className="bg-card text-foreground border-none">
      <CardHeader>
        <CardTitle>Create Agent</CardTitle>
        <CardDescription>Define and save a new custom agent</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4">
          <div className="grid grid-cols-3 items-center gap-4">
            <Label>Name</Label>
            <Input
              className="col-span-2"
              ref={nameRef}
              placeholder="Agent name"
            />
          </div>

          <div className="grid grid-cols-3 items-center gap-4">
            <Label>Description</Label>
            <Input
              className="col-span-2"
              ref={descRef}
              placeholder="Agent description"
            />
          </div>

          <div className="grid grid-cols-3 items-start gap-4">
            <Label className="pt-2">System Prompt</Label>
            <textarea
              className="col-span-2 min-h-[100px] rounded border p-2"
              ref={promptRef}
              placeholder="Agent prompt"
            />
          </div>

          <div className="grid grid-cols-3 items-start gap-4">
            <Label className="pt-2">Built-in Tools</Label>
            <div className="col-span-2 space-y-2">
              {availableToolNames.map((tool) => (
                <div key={tool} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={selectedToolNames.includes(tool)}
                    onChange={(e) =>
                      setSelectedToolNames((prev) =>
                        e.target.checked
                          ? [...prev, tool]
                          : prev.filter((t) => t !== tool),
                      )
                    }
                  />
                  <label>{tool}</label>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={handleSaveAgent}>Save Agent</Button>
      </CardFooter>
    </Card>
  );
}
