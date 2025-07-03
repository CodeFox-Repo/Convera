import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { baseURL } from "@/lib/api-client";
import { Bot, Mail, Server, Shield, TrendingUp, Users } from "lucide-react";
import { useEffect, useState } from "react";

interface MCPServer {
  id: string;
  enabled: boolean;
}

interface DashboardStats {
  totalUsers: number;
  emailVerified: number;
  usersByRole: {
    user: number;
    admin: number;
  };
  recentRegistrations: Array<{
    date: string;
    count: number;
  }>;
  mcpServers?: {
    total: number;
    enabled: number;
  };
  agentMarket?: {
    total: number;
  };
}

interface DashboardOverviewProps {
  onSectionChange?: (section: string) => void;
}

export function DashboardOverview({ onSectionChange }: DashboardOverviewProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const [userResponse, mcpResponse, agentMarketResponse] = await Promise.all([
        fetch(`${baseURL}/api/users/stats`, {
          credentials: "include",
        }),
        fetch(`${baseURL}/api/app`, {
          credentials: "include",
        }),
        fetch(`${baseURL}/api/agent-market`, {
          credentials: "include",
        }),
      ]);

      if (userResponse.ok) {
        const userData = await userResponse.json();
        const mcpData = mcpResponse.ok ? await mcpResponse.json() : null;
        const agentMarketData = agentMarketResponse.ok ? await agentMarketResponse.json() : null;

        const mcpServers = mcpData?.data?.mcpServers || [];
        const agentMarketAgents = Array.isArray(agentMarketData) ? agentMarketData : [];
        
        setStats({
          ...userData.stats,
          mcpServers: {
            total: mcpServers.length,
            enabled: mcpServers.filter((s: MCPServer) => s.enabled).length,
          },
          agentMarket: {
            total: agentMarketAgents.length,
          },
        });
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse space-y-2">
                  <div className="h-4 w-1/2 rounded bg-gray-200"></div>
                  <div className="h-8 w-3/4 rounded bg-gray-200"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="mt-1 text-gray-600">
          Welcome to your admin dashboard. Here's what's happening with your system.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalUsers || 0}</div>
            <p className="text-muted-foreground text-xs">
              +{stats?.recentRegistrations?.reduce((sum, day) => sum + day.count, 0) || 0} this
              month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Admins</CardTitle>
            <Shield className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.usersByRole?.admin || 0}</div>
            <p className="text-muted-foreground text-xs">Admin users</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Email Verified</CardTitle>
            <Mail className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.emailVerified || 0}</div>
            <p className="text-muted-foreground text-xs">
              {stats?.totalUsers ? Math.round((stats.emailVerified / stats.totalUsers) * 100) : 0}%
              verified
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Regular Users</CardTitle>
            <TrendingUp className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.usersByRole?.user || 0}</div>
            <p className="text-muted-foreground text-xs">Standard access</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">App MCP</CardTitle>
            <Server className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.mcpServers?.total || 0}</div>
            <p className="text-muted-foreground text-xs">
              {stats?.mcpServers?.enabled || 0} available
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Agent Market</CardTitle>
            <Bot className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.agentMarket?.total || 0}</div>
            <p className="text-muted-foreground text-xs">
              Published agents
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions and Recent Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common administrative tasks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className="flex cursor-pointer items-center space-x-3 rounded-lg border p-3 transition-colors hover:bg-gray-50"
              onClick={() => onSectionChange?.("users")}
            >
              <Users className="h-5 w-5 text-blue-500" />
              <div>
                <div className="font-medium">Manage Users</div>
                <div className="text-sm text-gray-500">View and edit user accounts</div>
              </div>
            </div>
            <div
              className="flex cursor-pointer items-center space-x-3 rounded-lg border p-3 transition-colors hover:bg-gray-50"
              onClick={() => onSectionChange?.("mcp")}
            >
              <Server className="h-5 w-5 text-purple-500" />
              <div>
                <div className="font-medium">App MCP</div>
                <div className="text-sm text-gray-500">Manage App MCP marketplace</div>
              </div>
            </div>
            <div
              className="flex cursor-pointer items-center space-x-3 rounded-lg border p-3 transition-colors hover:bg-gray-50"
              onClick={() => onSectionChange?.("agent-market")}
            >
              <Bot className="h-5 w-5 text-green-500" />
              <div>
                <div className="font-medium">Agent Market</div>
                <div className="text-sm text-gray-500">Manage published agents</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="py-8 text-center text-sm text-gray-500">
              No recent activity data available
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
