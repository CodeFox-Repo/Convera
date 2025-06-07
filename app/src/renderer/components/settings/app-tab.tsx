import { Button } from "@/renderer/components/ui/button";
import { ExternalLink, Globe, Monitor, Server, Smartphone } from "lucide-react";
import React, { useState } from "react";
import { toast } from "sonner";

interface App {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  type: "desktop" | "web" | "mobile";
  version?: string;
}

interface ConnectedApp extends App {
  lastConnected: string;
}

interface AppTabProps {}

export function AppTab({}: AppTabProps) {
  const [connectedApps, setConnectedApps] = useState<ConnectedApp[]>([
    {
      id: "foxychat-desktop",
      name: "FoxyChat Desktop",
      description: "Main desktop application for FoxyChat",
      icon: <Monitor className="h-5 w-5" />,
      type: "desktop",
      version: "1.2.4",
      lastConnected: "2 minutes ago",
    },
    {
      id: "foxychat-web",
      name: "FoxyChat Web",
      description: "Web interface for FoxyChat",
      icon: <Globe className="h-5 w-5" />,
      type: "web",
      version: "1.2.1",
      lastConnected: "5 minutes ago",
    },
  ]);

  const [availableApps] = useState<App[]>([
    {
      id: "foxychat-mobile",
      name: "FoxyChat Mobile",
      description: "Mobile companion app",
      icon: <Smartphone className="h-5 w-5" />,
      type: "mobile",
      version: "1.1.8",
    },
    {
      id: "slack-integration",
      name: "Slack Integration",
      description: "Slack workspace integration",
      icon: <ExternalLink className="h-5 w-5" />,
      type: "web",
    },
    {
      id: "discord-bot",
      name: "Discord Bot",
      description: "Discord server integration",
      icon: <Server className="h-5 w-5" />,
      type: "web",
    },
  ]);

  const handleDisconnect = (appId: string, appName: string) => {
    setConnectedApps(connectedApps.filter((app) => app.id !== appId));
    toast.success(`${appName} disconnected`);
  };

  const handleConnect = (app: App) => {
    const newConnectedApp: ConnectedApp = {
      ...app,
      lastConnected: "Just now",
    };
    setConnectedApps([...connectedApps, newConnectedApp]);
    toast.success(`${app.name} connected`);
  };

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-2xl font-medium text-foreground">Apps</h2>
        <p className="text-muted-foreground mt-1">
          Manage your connected applications
        </p>
      </div>

      {/* Connected Apps */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-foreground">Connected</h3>
        {connectedApps.length === 0 ? (
          <p className="text-muted-foreground">No apps connected yet.</p>
        ) : (
          <div className="space-y-4">
            {connectedApps.map((app) => (
              <div
                key={app.id}
                className="bg-card hover:bg-card/90 flex items-start justify-between rounded-lg p-4 transition-colors shadow-xs border border-border/30"
              >
                <div className="flex items-start gap-3">
                  <div className="text-primary bg-primary/10 rounded-full p-1.5">
                    {app.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium leading-tight">{app.name}</h4>
                      {app.version && (
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                          v{app.version}
                        </span>
                      )}
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {app.description}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Last connected: {app.lastConnected}
                    </p>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                  onClick={() => handleDisconnect(app.id, app.name)}
                >
                  Disconnect
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Available Apps */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-foreground">Apps</h3>
        <div className="space-y-4">
          {availableApps
            .filter(
              (app) =>
                !connectedApps.some((connected) => connected.id === app.id),
            )
            .map((app) => (
              <div
                key={app.id}
                className="bg-card hover:bg-card/90 flex items-start justify-between rounded-lg p-4 transition-colors shadow-xs border border-border/30"
              >
                <div className="flex items-start gap-3">
                  <div className="text-muted-foreground bg-muted rounded-full p-1.5">
                    {app.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium leading-tight">{app.name}</h4>
                      {app.version && (
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                          v{app.version}
                        </span>
                      )}
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {app.description}
                    </p>
                  </div>
                </div>

                <Button
                  variant="default"
                  size="sm"
                  onClick={() => handleConnect(app)}
                >
                  Connect
                </Button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
