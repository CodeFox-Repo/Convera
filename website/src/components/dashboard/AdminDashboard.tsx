import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Bot, Server, Users } from "lucide-react";
import { AgentMarketManagement } from "./AgentMarketManagement";
import { DashboardOverview } from "./DashboardOverview";
import { MCPManagement } from "./MCPManagement";
import { UserManagement } from "./UserManagement";

const AdminDashboard = () => {
  return (
    <div className="container mx-auto max-w-7xl space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground">Manage users, services, and system configuration.</p>
      </div>

      {/* Dashboard Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 bg-muted/50">
          <TabsTrigger 
            value="overview" 
            className="flex items-center gap-2 text-muted-foreground hover:text-orange-500 data-[state=active]:text-orange-600 data-[state=active]:bg-orange-50 data-[state=active]:border-orange-200 transition-colors relative"
          >
            <BarChart3 className="h-4 w-4 transition-colors" />
            Overview
            <div className="absolute right-2 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-orange-500 opacity-0 data-[state=active]:opacity-100 transition-opacity" />
          </TabsTrigger>
          <TabsTrigger 
            value="users" 
            className="flex items-center gap-2 text-muted-foreground hover:text-orange-500 data-[state=active]:text-orange-600 data-[state=active]:bg-orange-50 data-[state=active]:border-orange-200 transition-colors relative"
          >
            <Users className="h-4 w-4 transition-colors" />
            Users
            <div className="absolute right-2 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-orange-500 opacity-0 data-[state=active]:opacity-100 transition-opacity" />
          </TabsTrigger>
          <TabsTrigger 
            value="mcp" 
            className="flex items-center gap-2 text-muted-foreground hover:text-orange-500 data-[state=active]:text-orange-600 data-[state=active]:bg-orange-50 data-[state=active]:border-orange-200 transition-colors relative"
          >
            <Server className="h-4 w-4 transition-colors" />
            MCP Servers
            <div className="absolute right-2 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-orange-500 opacity-0 data-[state=active]:opacity-100 transition-opacity" />
          </TabsTrigger>
          <TabsTrigger 
            value="agentMarket" 
            className="flex items-center gap-2 text-muted-foreground hover:text-orange-500 data-[state=active]:text-orange-600 data-[state=active]:bg-orange-50 data-[state=active]:border-orange-200 transition-colors relative"
          >
            <Bot className="h-4 w-4 transition-colors" />
            Agent Market
            <div className="absolute right-2 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-orange-500 opacity-0 data-[state=active]:opacity-100 transition-opacity" />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <DashboardOverview onSectionChange={() => {}} />
        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>User Management</CardTitle>
              <CardDescription>Manage user accounts and permissions.</CardDescription>
            </CardHeader>
            <CardContent>
              <UserManagement />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mcp" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>MCP Server Management</CardTitle>
              <CardDescription>
                Configure and monitor Model Context Protocol servers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MCPManagement />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agentMarket" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Agent Market Management</CardTitle>
              <CardDescription>Manage AI agents and marketplace listings.</CardDescription>
            </CardHeader>
            <CardContent>
              <AgentMarketManagement />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminDashboard;
