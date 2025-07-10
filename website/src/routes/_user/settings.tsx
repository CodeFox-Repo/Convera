import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/use-toast";
import { getBaseURL, useSession } from "@/lib/auth-client";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, Mail, Settings, User } from "lucide-react";

export const Route = createFileRoute("/_user/settings")({
  component: UserSettings,
});

// Custom hook for customer portal
function useCustomerPortal() {
  return useMutation({
    mutationFn: async (customerId: string) => {
      try {
        // First, try to validate the request with fetch
        const response = await fetch(`${getBaseURL()}/api/subscription/customer-portal`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ customerId }),
        });

        // If we get a 400 error, the customer doesn't exist
        if (response.status === 400) {
          throw new Error("You haven't subscribed yet.");
        }

        // If we get here but the request "fails" due to CORS (redirect), that's actually success
        // The fetch will fail with CORS when backend redirects to Stripe
      } catch (error: any) {
        // Check if it's a 400 error (customer not found)
        if (error.message.includes("subscribed")) {
          throw error;
        }
      }

      // Create a form and submit it to trigger the redirect
      const form = document.createElement("form");
      form.method = "POST";
      form.action = `${getBaseURL()}/api/subscription/customer-portal`;
      form.style.display = "none";

      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "customerId";
      input.value = customerId;

      form.appendChild(input);
      document.body.appendChild(form);
      form.submit();
      document.body.removeChild(form);

      return { success: true };
    },
    onError: (error: Error) => {
      console.error("Customer portal error:", error);
      toast({
        title: "Subscription Required",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

function UserSettings() {
  const { data: session } = useSession();
  const customerPortal = useCustomerPortal();

  const userInitials = session?.user.name
    ? session.user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    : session?.user.email?.[0]?.toUpperCase() || "U";

  const handleManageSubscription = () => {
    if (!session?.user?.id) {
      toast({
        title: "Error",
        description: "User session not found",
        variant: "destructive",
      });
      return;
    }

    // send user id to backend to get customer portal url
    customerPortal.mutate(session.user.id);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Account Settings</h1>
        <p className="text-muted-foreground">
          Manage your account, billing, and subscription preferences.
        </p>
      </div>

      <Separator />

      <Tabs defaultValue="billing" className="flex gap-6">
        <div className="w-48 shrink-0">
          <TabsList className="flex h-auto w-full flex-col items-stretch space-y-1 bg-transparent p-0">
            <TabsTrigger
              value="profile"
              className="hover:bg-accent hover:text-accent-foreground data-[state=active]:bg-accent data-[state=active]:text-accent-foreground flex w-full items-center justify-start gap-3 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors"
            >
              <User className="h-4 w-4" />
              Profile
            </TabsTrigger>
            <TabsTrigger
              value="billing"
              className="hover:bg-accent hover:text-accent-foreground data-[state=active]:bg-accent data-[state=active]:text-accent-foreground flex w-full items-center justify-start gap-3 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors"
            >
              <CreditCard className="h-4 w-4" />
              Billing
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="min-w-0 flex-1">
          {/* Profile Tab */}
          <TabsContent value="profile" className="mt-0 space-y-6">
            {/* Profile Header */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center space-x-4">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={session?.user.image || ""} alt={session?.user.name || ""} />
                    <AvatarFallback className="bg-gradient-to-br from-orange-400 to-orange-600 text-2xl font-bold text-white">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="space-y-1">
                    <h2 className="text-2xl font-semibold">{session?.user.name || "User"}</h2>
                    <p className="text-muted-foreground">{session?.user.email}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">User</Badge>
                      {session?.user.emailVerified && <Badge variant="outline">Verified</Badge>}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Billing Tab */}
          <TabsContent value="billing" className="mt-0 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Subscription Management</CardTitle>
                <CardDescription>
                  Manage your subscription, payment methods, and billing information.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-center">
                    <Button onClick={handleManageSubscription} disabled={customerPortal.isPending}>
                      <Settings className="mr-2 h-4 w-4" />
                      {customerPortal.isPending ? "Opening..." : "Manage Subscription"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">Upcoming Invoice</CardTitle>
                <CardDescription>Your next billing cycle and charges</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center">
                  <Mail className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-semibold text-gray-900">No upcoming invoices</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    You don't have any upcoming invoices. Invoices will appear here when you have an
                    active subscription.
                  </p>
                  <Button className="mt-4">View Subscription Plans</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
