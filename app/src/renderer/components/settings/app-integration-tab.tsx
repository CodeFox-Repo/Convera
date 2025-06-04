import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Input } from "../ui/input";

interface Integration {
  id: string;
  name: string;
  description: string;
}

const INTEGRATIONS: Integration[] = [
  { id: "google-calendar", name: "Google Calendar", description: "Sync events from Google Calendar" },
  { id: "slack", name: "Slack", description: "Receive notifications in Slack" },
  { id: "github", name: "GitHub", description: "Connect your GitHub repositories" },
];

export function AppIntegrationTab() {
  const [query, setQuery] = useState("");

  const filtered = INTEGRATIONS.filter((integration) =>
    `${integration.name} ${integration.description}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-2xl font-medium text-foreground">App Integrations</h2>
        <p className="text-muted-foreground mt-1">
          Connect third-party apps to enhance your workflow
        </p>
      </div>

      <div className="relative">
        <div className="border-border bg-secondary/30 focus-within:ring-primary/30 flex items-center rounded-md border px-3 py-2 focus-within:ring-1 dark:bg-background/60 dark:border-gray-700">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search integrations"
            className="flex-1 border-none bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground"
          />
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="text-muted-foreground h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((integration) => (
          <Card key={integration.id} className="bg-card/90">
            <CardHeader>
              <CardTitle>{integration.name}</CardTitle>
              <CardDescription>{integration.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Integration setup coming soon...</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default AppIntegrationTab;
