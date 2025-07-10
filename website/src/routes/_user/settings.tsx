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
import { AlertCircle, CheckCircle, CreditCard, Crown, Mail, Settings, User } from "lucide-react";

export const Route = createFileRoute("/_user/settings")({
  component: UserSettings,
});

// Custom hook for customer portal
function useCustomerPortal() {
  return useMutation({
    mutationFn: async (customerId: string) => {
      const response = await fetch(`${getBaseURL()}/api/subscription/customer-portal`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ customerId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to access customer portal");
      }

      // The backend redirects, but in case it returns data
      return response.json().catch(() => ({}));
    },
    onError: (error: Error) => {
      console.error("Customer portal error:", error);
      toast({
        title: "Error",
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

    // Use user ID as customerId (common pattern with Stripe)
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
            <TabsTrigger
              value="subscription"
              className="hover:bg-accent hover:text-accent-foreground data-[state=active]:bg-accent data-[state=active]:text-accent-foreground flex w-full items-center justify-start gap-3 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors"
            >
              <Crown className="h-4 w-4" />
              Subscription
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

            <Card>
              <CardHeader>
                <CardTitle>Billing History</CardTitle>
                <CardDescription>View your past invoices and billing history.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center">
                  <Mail className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-semibold text-gray-900">No billing history</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Your billing history will appear here once you have a subscription.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Subscription Tab */}
          <TabsContent value="subscription" className="mt-0 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Crown className="h-5 w-5" />
                  Current Plan
                </CardTitle>
                <CardDescription>Manage your subscription plan and features.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-1">
                    <h3 className="font-semibold">Free Plan</h3>
                    <p className="text-muted-foreground text-sm">
                      Perfect for getting started with Foxychat
                    </p>
                  </div>
                  <Badge variant="secondary">Current</Badge>
                </div>

                <div className="space-y-3">
                  <h4 className="font-medium">Plan Features:</h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm">Basic chat functionality</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm">5 conversations per day</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-gray-400" />
                      <span className="text-muted-foreground text-sm">Advanced AI models</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-gray-400" />
                      <span className="text-muted-foreground text-sm">Priority support</span>
                    </div>
                  </div>
                </div>

                <Button className="w-full">Upgrade to Pro</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Available Plans</CardTitle>
                <CardDescription>Choose the plan that best fits your needs.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border p-4">
                    <h3 className="font-semibold">Pro Plan</h3>
                    <p className="text-2xl font-bold">
                      $9.99<span className="text-sm font-normal">/month</span>
                    </p>
                    <ul className="mt-2 space-y-1 text-sm">
                      <li>• Unlimited conversations</li>
                      <li>• Advanced AI models</li>
                      <li>• Priority support</li>
                    </ul>
                    <Button className="mt-3 w-full" size="sm">
                      Choose Plan
                    </Button>
                  </div>

                  <div className="rounded-lg border p-4">
                    <h3 className="font-semibold">Enterprise</h3>
                    <p className="text-2xl font-bold">
                      $29.99<span className="text-sm font-normal">/month</span>
                    </p>
                    <ul className="mt-2 space-y-1 text-sm">
                      <li>• Everything in Pro</li>
                      <li>• Team collaboration</li>
                      <li>• Custom integrations</li>
                    </ul>
                    <Button className="mt-3 w-full" size="sm" variant="outline">
                      Contact Sales
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
