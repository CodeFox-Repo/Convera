import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/use-toast";
import { authClient, getBaseURL, useSession } from "@/lib/auth-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CreditCard, Edit2, Save, Settings, User, X } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_user/settings")({
  component: UserSettings,
});

// Custom hook for customer portal
function useCustomerPortal() {
  const navigate = useNavigate();

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

      // If user hasn't subscribed yet, redirect to pricing page
      if (error.message.includes("subscribed")) {
        toast({
          title: "Subscription Required",
          description: "Redirecting to pricing page...",
        });
        // Navigate to pricing page
        navigate({ to: "/pricing" });
      } else {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      }
    },
  });
}

function UserSettings() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const customerPortal = useCustomerPortal();
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState("");

  const updateNameMutation = useMutation({
    mutationFn: async (name: string) => {
      await authClient.updateUser({ name });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Your name has been updated",
      });
      setIsEditingName(false);
      // Invalidate session query to refetch updated user data
      queryClient.invalidateQueries({ queryKey: ['session'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update name",
        variant: "destructive",
      });
    },
  });

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

  const handleEditName = () => {
    setNewName(session?.user.name || "");
    setIsEditingName(true);
  };

  const handleSaveName = () => {
    if (newName.trim() && newName !== session?.user.name) {
      updateNameMutation.mutate(newName.trim());
    } else {
      setIsEditingName(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingName(false);
    setNewName("");
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

      <Tabs defaultValue="profile" className="flex gap-6">
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
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      {isEditingName ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Enter your name"
                            className="max-w-xs"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveName();
                              if (e.key === "Escape") handleCancelEdit();
                            }}
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={handleSaveName}
                            disabled={updateNameMutation.isPending}
                          >
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={handleCancelEdit}
                            disabled={updateNameMutation.isPending}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <h2 className="text-2xl font-semibold">{session?.user.name || "User"}</h2>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={handleEditName}
                            className="h-8 w-8"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
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
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
