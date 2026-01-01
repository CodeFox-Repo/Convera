import { RequestMatrixGraph } from "@/components/RequestMatrixGraph";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/use-toast";
import { authClient, getBaseURL, useSession } from "@/lib/auth-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Camera, CreditCard, Edit2, Save, Settings, User, X } from "lucide-react";
import { useEffect, useState } from "react";

interface UsageStats {
  total: {
    requests: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  recent: {
    requests: number;
    tokens: number;
  };
  byModel: Array<{
    modelId: string;
    requests: number;
    tokens: number;
  }>;
  daily: Array<{
    date: string;
    requests: number;
    tokens: number;
  }>;
}

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
          title: "SUBSCRIPTION_REQUIRED",
          description: "Redirecting to payment gateway...",
        });
        // Navigate to pricing page
        navigate({ to: "/pricing" });
      } else {
        toast({
          title: "PORTAL_ACCESS_ERROR",
          description: error.message || "Customer portal connection failed",
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
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [currentAvatar, setCurrentAvatar] = useState<string | null>(null);

  const updateNameMutation = useMutation({
    mutationFn: async (name: string) => {
      await authClient.updateUser({ name });
    },
    onSuccess: () => {
      toast({
        title: "USER_UPDATE_SUCCESS",
        description: "Username successfully updated in database",
      });
      setIsEditingName(false);
      // Invalidate session query to refetch updated user data
      queryClient.invalidateQueries({ queryKey: ["session"] });
    },
    onError: (error) => {
      toast({
        title: "USER_UPDATE_ERROR",
        description: error.message || "Database update operation failed",
        variant: "destructive",
      });
    },
  });

  // Load usage statistics
  useEffect(() => {
    const loadUsageStats = async () => {
      if (!session?.user) return;

      setLoadingStats(true);
      try {
        const response = await fetch(`${getBaseURL()}/api/users/usage`, {
          credentials: "include",
        });

        if (response.ok) {
          const data = await response.json();
          setUsageStats(data.usage);
        } else {
          console.error("Failed to load usage stats:", response.status);
        }
      } catch (error) {
        console.error("Failed to load usage stats:", error);
      } finally {
        setLoadingStats(false);
      }
    };

    if (session?.user) {
      loadUsageStats();
    }
  }, [session?.user]);

  // Initialize current avatar from session
  useEffect(() => {
    if (session?.user?.image) {
      setCurrentAvatar(session.user.image);
    }
  }, [session?.user?.image]);

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
        title: "SESSION_ERROR",
        description: "Authentication token expired. Please login",
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

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "FILE_TYPE_ERROR",
        description: "Invalid file format. Image format required",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "FILE_SIZE_ERROR",
        description: "File exceeds 5MB limit. Compression required",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingAvatar(true);

    try {
      // Upload the file to get the URL without updating database
      const formData = new FormData();
      formData.append("avatar", file);

      const uploadResponse = await fetch(`${getBaseURL()}/api/users/avatar?uploadOnly=true`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload file");
      }

      const uploadResult = await uploadResponse.json();
      const avatarUrl = uploadResult.avatarUrl;

      // Update local state immediately for instant feedback
      setCurrentAvatar(avatarUrl);

      // Update user profile with new avatar
      await authClient.updateUser({ image: avatarUrl });
      
      // Invalidate session to refetch updated user data
      queryClient.invalidateQueries({ queryKey: ['session'] });

      toast({
        title: "AVATAR_UPLOAD_SUCCESS",
        description: "Profile image successfully uploaded to server",
      });
    } catch (error) {
      console.error("Avatar upload error:", error);
      toast({
        title: "AVATAR_UPLOAD_ERROR",
        description: "File upload process terminated unexpectedly",
        variant: "destructive",
      });
      // Reset avatar state on error
      setCurrentAvatar(session?.user?.image || null);
    } finally {
      setIsUploadingAvatar(false);
    }
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
                  <div className="relative group">
                    <Avatar className="h-20 w-20">
                      <AvatarImage 
                        src={currentAvatar || session?.user.image || ""} 
                        alt={session?.user.name || ""} 
                      />
                      <AvatarFallback className="bg-gradient-to-br from-orange-400 to-orange-600 text-2xl font-bold text-white">
                        {userInitials}
                      </AvatarFallback>
                    </Avatar>
                    
                    {/* Upload overlay */}
                    <label
                      htmlFor="avatar-upload"
                      className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      {isUploadingAvatar ? (
                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent" />
                      ) : (
                        <Camera className="h-6 w-6 text-white" />
                      )}
                    </label>

                    <input
                      id="avatar-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      className="hidden"
                      disabled={isUploadingAvatar}
                    />
                  </div>
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

            {/* Matrix Graph */}
            <RequestMatrixGraph usageStats={usageStats} loading={loadingStats} />
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
