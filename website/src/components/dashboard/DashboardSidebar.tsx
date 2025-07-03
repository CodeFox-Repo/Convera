import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { UserButton } from "@daveyplate/better-auth-ui";
import { Home, Server, ShoppingCart, Users } from "lucide-react";

interface DashboardSidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

const sidebarItems = [
  {
    id: "overview",
    label: "Overview",
    icon: Home,
    description: "Dashboard overview",
  },
  {
    id: "users",
    label: "User Management",
    icon: Users,
    description: "Manage users and roles",
  },
  {
    id: "mcp",
    label: "App MCP",
    icon: Server,
    description: "Manage App MCP marketplace",
  },
  {
    id: "agentMarket",
    label: "Agent Market",
    icon: ShoppingCart,
    description: "Manage Agent marketplace",
  },
];

export function DashboardSidebar({ activeSection, onSectionChange }: DashboardSidebarProps) {
  return (
    <div className="flex h-screen w-64 flex-col border-r border-gray-200 bg-white">
      {/* Navigation - flex-1 to take up remaining space */}
      <nav className="flex-1 space-y-2 overflow-y-auto p-4">
        {sidebarItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;

          return (
            <Button
              key={item.id}
              variant={isActive ? "default" : "ghost"}
              className={cn(
                "h-auto w-full justify-start p-3 text-left",
                isActive
                  ? "border border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
              )}
              onClick={() => onSectionChange(item.id)}
            >
              <Icon
                className={cn(
                  "mr-3 h-4 w-4 flex-shrink-0",
                  isActive ? "text-orange-600" : "text-gray-500",
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{item.label}</div>
                <div className="truncate text-xs text-gray-500">{item.description}</div>
              </div>
            </Button>
          );
        })}
      </nav>

      {/* User Info - positioned at bottom with better-auth UI UserButton */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <UserButton className="flex-1" />
          <Badge variant="secondary" className="ml-2 bg-orange-100 text-xs text-orange-800">
            Admin
          </Badge>
        </div>
      </div>
    </div>
  );
}
