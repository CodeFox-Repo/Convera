import { AuthModal } from "@/renderer/components/auth/auth-modal";
import { User } from "lucide-react";
import React from "react";
import { useAccountProfile } from "@/renderer/libs/hooks/use-account-profile";
import { useUsageStats } from "@/renderer/libs/hooks/use-usage-stats";
import { ProfileSection } from "./profile-section";
import { UsageStatsSection } from "./usage-stats-section";

export function AccountSection() {
  const {
    user,
    currentAvatar,
    isEditingName,
    editedName,
    isUpdatingName,
    isUploadingAvatar,
    setEditedName,
    handleSignOut,
    handleStartEdit,
    handleCancelEdit,
    handleSaveName,
    handleAvatarUpload,
  } = useAccountProfile();

  const { usageStats, loadingStats, formatNumber } = useUsageStats(user);

  if (user) {
    return (
      <div className="space-y-6">
        <ProfileSection
          user={user}
          currentAvatar={currentAvatar}
          isEditingName={isEditingName}
          editedName={editedName}
          isUpdatingName={isUpdatingName}
          isUploadingAvatar={isUploadingAvatar}
          setEditedName={setEditedName}
          onStartEdit={handleStartEdit}
          onCancelEdit={handleCancelEdit}
          onSaveName={handleSaveName}
          onAvatarUpload={handleAvatarUpload}
          onSignOut={handleSignOut}
        />

        <UsageStatsSection
          usageStats={usageStats}
          loadingStats={loadingStats}
          formatNumber={formatNumber}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center py-8 border border-border rounded-lg">
        <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
          <User className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Sign In Required
        </h3>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
          Please sign in to access your profile and view usage statistics
        </p>
        <AuthModal />
      </div>
    </div>
  );
}
