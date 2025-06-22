import { Badge } from "@/components/ui/badge";
import { useSession } from "@/lib/auth-client";
import { Shield } from "lucide-react";
import { useState } from "react";
import { DashboardOverview } from "./DashboardOverview";
import { DashboardSidebar } from "./DashboardSidebar";
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
      default:
        return "Dashboard Overview";
    }
  };

  return (
    <div className="bg-background flex min-h-screen">
      {/* Sidebar */}
      <DashboardSidebar activeSection={activeSection} onSectionChange={setActiveSection} />

      {/* Main Content */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 bg-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">{getSectionTitle()}</h1>
              <p className="mt-1 text-sm text-gray-600">
                Welcome back, {session?.user?.name || session?.user?.email}
              </p>
            </div>
            <Badge variant="secondary" className="bg-orange-100 text-orange-800">
              <Shield className="mr-1 h-3 w-3" />
              Admin Access
            </Badge>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-6">{renderContent()}</div>
      </div>
    </div>
  );
};

export default AdminDashboard;
