import { AuthModal } from "@/renderer/components/auth/auth-modal";
import { useAccountProfile } from "@/renderer/libs/hooks/use-account-profile";
import { useUsageStats } from "@/renderer/libs/hooks/use-usage-stats";
import React from "react";
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
      <AuthModal />
    </div>
  );
}
