import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { UserButton } from "@daveyplate/better-auth-ui";
import { BarChart3, Bot, Home, Server, Settings, Users } from "lucide-react";
import Logo from "/icon.png";
interface DashboardSidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

const mainNavItems = [
  {
    id: "overview",
    label: "Dashboard",
    icon: Home,
  },
  {
    id: "users",
    label: "User Management",
    icon: Users,
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: BarChart3,
  },
  {
    id: "mcp",
    label: "App MCP",
    icon: Server,
  },
  {
    id: "agentMarket",
    label: "Agent Market",
    icon: Bot,
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
  },
];

export function DashboardSidebar({ activeSection, onSectionChange }: DashboardSidebarProps) {
  return (
    <div className="flex h-screen w-64 flex-col border-r border-gray-200 bg-white">
      {/* Brand Header */}
      <div className="flex items-center border-b border-gray-200 p-6">
        <img src={Logo} alt="FoxChat" width={32} height={32} />
        <span className="ml-1 text-lg font-semibold text-gray-900">Foxychat</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4">
        <div className="space-y-1">
          {mainNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;

            return (
              <button
                key={item.id}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                )}
                onClick={() => onSectionChange(item.id)}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* User Section */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <UserButton className="flex-1" />
          <Badge variant="secondary" className="ml-2 bg-gray-100 text-xs text-gray-700">
            Admin
          </Badge>
        </div>
      </div>
    </div>
  );
}
