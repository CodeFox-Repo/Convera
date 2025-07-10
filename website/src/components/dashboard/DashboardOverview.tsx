import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardStats } from "@/hooks/use-request";
import { Activity, AlertCircle, Bot, Mail, Server, Shield, TrendingUp, Users } from "lucide-react";

interface DashboardOverviewProps {
  onSectionChange?: (section: string) => void;
}

export function DashboardOverview({ onSectionChange }: DashboardOverviewProps) {
  const { data: stats, isLoading: loading, error } = useDashboardStats();

  if (error) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6">
          <div className="flex items-center">
            <div className="shrink-0">
              <AlertCircle className="h-5 w-5 text-red-400" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error loading dashboard stats</h3>
              <div className="mt-2 text-sm text-red-700">
                Failed to load dashboard statistics. Please try refreshing the page.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse space-y-2">
                  <div className="h-4 w-1/2 rounded bg-gray-200"></div>
                  <div className="h-8 w-3/4 rounded bg-gray-200"></div>
                  <div className="h-3 w-full rounded bg-gray-200"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const monthlyGrowth =
    stats?.recentRegistrations?.reduce(
      (sum: number, day: { count: number }) => sum + day.count,
      0,
    ) || 0;

  const emailVerificationRate = stats?.totalUsers
    ? (stats.emailVerified / stats.totalUsers) * 100
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="mt-1 text-gray-600">
          Welcome to your admin dashboard. Here's what's happening with your system.
        </p>
      </div>

      {/* Stats Grid - 3 cards per row max */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalUsers || 0}</div>
            <p className="text-muted-foreground text-xs">+{monthlyGrowth} this month</p>
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
              {emailVerificationRate.toFixed(1)}% verified
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Admin Users</CardTitle>
            <Shield className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.usersByRole?.admin || 0}</div>
            <p className="text-muted-foreground text-xs">System administrators</p>
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
            <CardTitle className="text-sm font-medium">MCP Servers</CardTitle>
            <Server className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.mcpServers?.total || 0}</div>
            <p className="text-muted-foreground text-xs">
              {stats?.mcpServers?.enabled || 0} active
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
            <p className="text-muted-foreground text-xs">Published agents</p>
          </CardContent>
        </Card>
      </div>

      {/* System Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            System Status
          </CardTitle>
          <CardDescription>Overview of system health and performance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Email Verification Rate</span>
                <span className="text-muted-foreground text-sm">
                  {emailVerificationRate.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-200">
                <div
                  className="h-2 rounded-full bg-green-500"
                  style={{ width: `${emailVerificationRate}%` }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">MCP Server Status</span>
                <span className="text-muted-foreground text-sm">
                  {stats?.mcpServers?.enabled || 0}/{stats?.mcpServers?.total || 0}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-200">
                <div
                  className="h-2 rounded-full bg-blue-500"
                  style={{
                    width: `${stats?.mcpServers?.total ? (stats.mcpServers.enabled / stats.mcpServers.total) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Admin Coverage</span>
                <span className="text-muted-foreground text-sm">
                  {stats?.totalUsers
                    ? (((stats.usersByRole?.admin || 0) / stats.totalUsers) * 100).toFixed(1)
                    : 0}
                  %
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-200">
                <div
                  className="h-2 rounded-full bg-orange-500"
                  style={{
                    width: `${stats?.totalUsers ? Math.min(((stats.usersByRole?.admin || 0) / stats.totalUsers) * 100, 100) : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

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
                <div className="font-medium">MCP Marketplace</div>
                <div className="text-sm text-gray-500">Manage MCP servers</div>
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
            <CardDescription>Latest system events</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center space-x-3 text-sm">
                <div className="h-2 w-2 rounded-full bg-green-500"></div>
                <div className="flex-1">
                  <div className="font-medium">New user registration</div>
                  <div className="text-gray-500">2 minutes ago</div>
                </div>
              </div>
              <div className="flex items-center space-x-3 text-sm">
                <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                <div className="flex-1">
                  <div className="font-medium">MCP server updated</div>
                  <div className="text-gray-500">15 minutes ago</div>
                </div>
              </div>
              <div className="flex items-center space-x-3 text-sm">
                <div className="h-2 w-2 rounded-full bg-purple-500"></div>
                <div className="flex-1">
                  <div className="font-medium">Agent published</div>
                  <div className="text-gray-500">1 hour ago</div>
                </div>
              </div>
              <div className="pt-3 text-center">
                <button className="text-sm text-blue-600 hover:text-blue-800">
                  View all activity
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
