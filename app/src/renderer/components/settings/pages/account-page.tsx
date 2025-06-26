import { AuthModal } from "@/renderer/components/auth/auth-modal";
import { Badge } from "@/renderer/components/ui/badge";
import { Button } from "@/renderer/components/ui/button";
import { Input } from "@/renderer/components/ui/input";
import { authClient } from "@/renderer/libs/auth-client";
import {
  BarChart3,
  Calendar,
  Camera,
  Check,
  Edit,
  LogOut,
  Upload,
  User,
  X,
  Zap,
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
      <div className="p-8 max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-foreground mb-8">Account</h2>

        <div className="flex h-24 items-center justify-center">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent"></div>
        </div>
      </div>
    );
  }

  // Not logged in state
  if (!session?.user) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-foreground mb-8">Account</h2>

        <div className="text-center py-8">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <User className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">
            Sign In Required
          </h3>
          <p className="text-muted-foreground mb-6">
            Please sign in to access your account
          </p>
          <AuthModal />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <h2 className="text-2xl font-bold text-foreground">Account</h2>

      {/* Profile Section */}
      <div className="flex items-center gap-8 pb-6 border-b border-border">
        {/* Avatar */}
        <div className="relative">
          <div className="w-24 h-24 rounded-full overflow-hidden bg-muted border-2 border-border">
            {user?.image ? (
              <img
                src={user.image}
                alt={user?.name || "User"}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <User className="h-12 w-12 text-muted-foreground" />
              </div>
            )}
          </div>

          <label
            htmlFor="avatar-upload"
            className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
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
          <div className="flex items-center gap-3 mb-2">
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="text-xl font-semibold max-w-xs"
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
              <>
                <h3 className="text-xl font-semibold text-foreground">
                  {user?.name || "User"}
                </h3>
                <Button size="sm" variant="ghost" onClick={handleStartEdit}>
                  <Edit className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
          <p className="text-muted-foreground mb-4">{user?.email}</p>

          <div className="flex gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => document.getElementById("avatar-upload")?.click()}
              disabled={isUploadingAvatar}
              className="flex items-center gap-2"
            >
              <Upload className="h-4 w-4" />
              Upload Avatar
            </Button>

            <Button
              variant="destructive"
              size="sm"
              onClick={handleSignOut}
              className="flex items-center gap-2"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>

      {/* Usage Statistics */}
      <div className="space-y-6">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Usage Statistics
        </h3>

        {loadingStats ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent mr-3"></div>
            <span className="text-muted-foreground">
              Loading usage statistics...
            </span>
          </div>
        ) : usageStats && usageStats.total.requests > 0 ? (
          <div className="space-y-6">
            {/* Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">
                    Total Requests
                  </span>
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {formatNumber(usageStats.total.requests)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(usageStats.recent.requests)} in last 30 days
                </p>
              </div>

              <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">
                    Total Tokens
                  </span>
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {formatNumber(usageStats.total.totalTokens)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(usageStats.recent.tokens)} in last 30 days
                </p>
              </div>

              <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">
                    Models Used
                  </span>
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {usageStats.byModel.length}
                </p>
                <p className="text-xs text-muted-foreground">
                  Different AI models
                </p>
              </div>
            </div>

            {/* Top Models */}
            {usageStats.byModel.length > 0 && (
              <div>
                <h4 className="text-md font-medium text-foreground mb-3">
                  Top Models
                </h4>
                <div className="space-y-2">
                  {getTopModels(usageStats.byModel).map((model, index) => (
                    <div
                      key={model.modelId}
                      className="flex items-center justify-between p-3 bg-muted/20 rounded-lg border border-border/30"
                    >
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-xs">
                          #{index + 1}
                        </Badge>
                        <span className="font-medium text-foreground">
                          {model.modelId}
                        </span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-foreground">
                          {formatNumber(model.tokens)} tokens
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatNumber(model.requests)} requests
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Token Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-muted/20 rounded-lg p-4 border border-border/30">
                <h4 className="text-sm font-medium text-foreground mb-3">
                  Token Usage Breakdown
                </h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Prompt Tokens
                    </span>
                    <span className="text-sm font-medium">
                      {formatNumber(usageStats.total.promptTokens)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Completion Tokens
                    </span>
                    <span className="text-sm font-medium">
                      {formatNumber(usageStats.total.completionTokens)}
                    </span>
                  </div>
                  <div className="border-t border-border pt-2">
                    <div className="flex justify-between">
                      <span className="text-sm font-medium text-foreground">
                        Total
                      </span>
                      <span className="text-sm font-bold">
                        {formatNumber(usageStats.total.totalTokens)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              {usageStats.daily.length > 0 && (
                <div className="bg-muted/20 rounded-lg p-4 border border-border/30">
                  <h4 className="text-sm font-medium text-foreground mb-3">
                    Recent Activity (Last 7 Days)
                  </h4>
                  <div className="space-y-2">
                    {usageStats.daily.slice(0, 5).map((day) => (
                      <div key={day.date} className="flex justify-between">
                        <span className="text-sm text-muted-foreground">
                          {day.date}
                        </span>
                        <span className="text-sm font-medium">
                          {formatNumber(day.requests)} requests
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">
              No usage data available yet.
            </p>
            <p className="text-sm text-muted-foreground">
              Start using remote servers to see your usage statistics here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
