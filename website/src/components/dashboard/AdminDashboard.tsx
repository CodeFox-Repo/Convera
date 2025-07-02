import { useSession } from "@/lib/auth-client";
import { useState } from "react";
import { DashboardOverview } from "./DashboardOverview";
import { DashboardSidebar } from "./DashboardSidebar";
import { MCPManagement } from "./MCPManagement";
import { UserManagement } from "./UserManagement";

const AdminDashboard = () => {
  const { data: session } = useSession();
  const [activeSection, setActiveSection] = useState("overview");

  const renderContent = () => {
    switch (activeSection) {
      case "overview":
        return <DashboardOverview onSectionChange={setActiveSection} />;
      case "users":
        return <UserManagement />;
      case "mcp":
        return <MCPManagement />;
      default:
        return <DashboardOverview onSectionChange={setActiveSection} />;
    }
  };

  const getSectionTitle = () => {
    switch (activeSection) {
      case "overview":
        return "Dashboard Overview";
      case "users":
        return "User Management";
      case "mcp":
        return "App MCP Management";
      default:
        return "Dashboard Overview";
    }
  };

  return (
    <div className="bg-background flex h-screen">
      {/* Sidebar */}
      <DashboardSidebar activeSection={activeSection} onSectionChange={setActiveSection} />

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-white px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">{getSectionTitle()}</h1>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">{renderContent()}</div>
      </div>
    </div>
  );
};

export default AdminDashboard;
