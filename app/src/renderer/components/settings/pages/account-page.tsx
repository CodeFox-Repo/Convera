import { AuthModal } from "@/renderer/components/auth/auth-modal";
import { Button } from "@/renderer/components/ui/button";
import { Input } from "@/renderer/components/ui/input";
import { authClient } from "@/renderer/libs/auth-client";
import {
  BarChart3,
  Camera,
  Check,
  Edit,
  LogOut,
  Upload,
  User,
  X,
} from "lucide-react";
import React, { useEffect, useState } from "react";

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

export function AccountSettingsPage() {
  const { data: session, isPending } = authClient.useSession();
  const { signOut } = authClient;
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  const user = session?.user;

  // Load usage statistics
  useEffect(() => {
    if (user) {
      loadUsageStats();
    }
  }, [user]);

  const loadUsageStats = async () => {
    if (!user) return;

    setLoadingStats(true);
    try {
      console.log("Loading usage stats...");
      const response = await fetch("/api/users/usage", {
        credentials: "include",
      });

      console.log(
        "Usage stats response:",
        response.status,
        response.statusText,
      );

      if (response.ok) {
        const data = await response.json();
        console.log("Usage stats data:", data);
        setUsageStats(data.usage);
      } else {
        const errorData = await response.text();
        console.error("Usage stats error:", response.status, errorData);
      }
    } catch (error) {
      console.error("Failed to load usage stats:", error);
    } finally {
      setLoadingStats(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      window.location.reload();
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  const handleStartEdit = () => {
    setEditedName(user?.name || "");
    setIsEditingName(true);
  };

  const handleCancelEdit = () => {
    setIsEditingName(false);
    setEditedName("");
  };

  const handleSaveName = async () => {
    if (!editedName.trim()) return;

    setIsUpdatingName(true);
    try {
      const response = await fetch("/api/users/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ name: editedName.trim() }),
      });

      if (response.ok) {
        // Reload session to get updated user data
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.message || "Failed to update name");
      }
    } catch (error) {
      console.error("Failed to update name:", error);
      alert("Failed to update name");
    } finally {
      setIsUpdatingName(false);
      setIsEditingName(false);
    }
  };

  const handleAvatarUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Image size should be less than 5MB");
      return;
    }

    setIsUploadingAvatar(true);

    try {
      const formData = new FormData();
      formData.append("avatar", file);

      const response = await fetch("/api/users/avatar", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (response.ok) {
        // Reload to get updated avatar
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.message || "Failed to upload avatar");
      }
    } catch (error) {
      console.error("Avatar upload error:", error);
      alert("Failed to upload avatar");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat().format(num);
  };

  const getTopModels = (modelUsage: UsageStats["byModel"]) => {
    return modelUsage.sort((a, b) => b.tokens - a.tokens).slice(0, 3);
  };

  // Loading state
  if (isPending) {
    return (
      <div className="min-h-full bg-background">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="px-8 py-6 border-b border-border/30">
            <h2 className="text-2xl font-semibold text-foreground">Account</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your profile and view usage statistics
            </p>
          </div>

          <div className="flex items-center justify-center py-24">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent mr-3"></div>
            <span className="text-muted-foreground">
              Loading account information...
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Not logged in state
  if (!session?.user) {
    return (
      <div className="min-h-full bg-background">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="px-8 py-6 border-b border-border/30">
            <h2 className="text-2xl font-semibold text-foreground">Account</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your profile and view usage statistics
            </p>
          </div>

          <div className="text-center py-24">
            <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-6">
              <User className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Sign In Required
            </h3>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              Please sign in to access your account settings and view usage
              statistics
            </p>
            <AuthModal />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="px-8 py-6 border-b border-border/30">
          <h2 className="text-2xl font-semibold text-foreground">Account</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your profile and view usage statistics
          </p>
        </div>

        {/* Profile Section */}
        <div className="px-8 py-6 border-b border-border/20">
          <div className="flex items-center gap-6">
            {/* Avatar */}
            <div className="relative group">
              <div className="w-20 h-20 rounded-full overflow-hidden bg-muted border border-border/30">
                {user?.image ? (
                  <img
                    src={user.image}
                    alt={user?.name || "User"}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-muted">
                    <User className="h-10 w-10 text-muted-foreground" />
                  </div>
                )}
              </div>

              <label
                htmlFor="avatar-upload"
                className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                {isUploadingAvatar ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                ) : (
                  <Camera className="h-5 w-5 text-white" />
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

            {/* User Info */}
            <div className="flex-1">
              {isEditingName ? (
                <div className="flex items-center gap-3">
                  <Input
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    className="text-lg font-semibold max-w-sm"
                    disabled={isUpdatingName}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleSaveName}
                    disabled={isUpdatingName || !editedName.trim()}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleCancelEdit}
                    disabled={isUpdatingName}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-foreground">
                    {user?.name || "User"}
                  </h3>
                  <Button size="sm" variant="ghost" onClick={handleStartEdit}>
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <p className="text-muted-foreground mt-1">{user?.email}</p>

              <div className="flex gap-3 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    document.getElementById("avatar-upload")?.click()
                  }
                  disabled={isUploadingAvatar}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Avatar
                </Button>

                <Button variant="outline" size="sm" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Usage Statistics */}
        <div className="px-8 py-6">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-foreground mb-1">
              Usage Statistics
            </h3>
            <p className="text-sm text-muted-foreground">
              Track your API usage and patterns
            </p>
          </div>

          {loadingStats ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent mr-3"></div>
              <span className="text-muted-foreground">
                Loading usage statistics...
              </span>
            </div>
          ) : usageStats && usageStats.total.requests > 0 ? (
            <div className="space-y-8">
              {/* Overview Stats */}
              <div className="grid grid-cols-3 gap-8">
                <div className="text-center">
                  <div className="text-2xl font-bold text-foreground">
                    {formatNumber(usageStats.total.requests)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Total Requests
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {formatNumber(usageStats.recent.requests)} this month
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-foreground">
                    {formatNumber(usageStats.total.totalTokens)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Total Tokens
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {formatNumber(usageStats.recent.tokens)} this month
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-foreground">
                    {usageStats.byModel.length}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Models Used
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Different AI models
                  </div>
                </div>
              </div>

              {/* Top Models */}
              {usageStats.byModel.length > 0 && (
                <div>
                  <h4 className="font-semibold text-foreground mb-4">
                    Most Used Models
                  </h4>
                  <div className="space-y-0">
                    {getTopModels(usageStats.byModel).map((model, index) => (
                      <div
                        key={model.modelId}
                        className="flex items-center justify-between py-3 border-b border-border/10 last:border-b-0"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
                            {index + 1}
                          </div>
                          <span className="font-medium text-foreground">
                            {model.modelId}
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-foreground">
                            {formatNumber(model.tokens)} tokens
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatNumber(model.requests)} requests
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Token Breakdown */}
              <div>
                <h4 className="font-semibold text-foreground mb-4">
                  Token Usage Breakdown
                </h4>
                <div className="space-y-0">
                  <div className="flex justify-between py-3 border-b border-border/10">
                    <span className="text-muted-foreground">Prompt Tokens</span>
                    <span className="font-medium text-foreground">
                      {formatNumber(usageStats.total.promptTokens)}
                    </span>
                  </div>
                  <div className="flex justify-between py-3 border-b border-border/10">
                    <span className="text-muted-foreground">
                      Completion Tokens
                    </span>
                    <span className="font-medium text-foreground">
                      {formatNumber(usageStats.total.completionTokens)}
                    </span>
                  </div>
                  <div className="flex justify-between py-3">
                    <span className="font-semibold text-foreground">Total</span>
                    <span className="font-bold text-foreground">
                      {formatNumber(usageStats.total.totalTokens)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                <BarChart3 className="h-8 w-8 text-muted-foreground" />
              </div>
              <h4 className="font-semibold text-foreground mb-2">
                No Usage Data Yet
              </h4>
              <p className="text-muted-foreground text-sm">
                Start using remote servers to see your usage statistics here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
