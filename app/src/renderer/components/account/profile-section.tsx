import { Button } from "@/renderer/components/ui/button";
import { Input } from "@/renderer/components/ui/input";
import { Camera, Check, Edit, LogOut, User, X } from "lucide-react";
import React from "react";
import { User as UserType } from "@/renderer/types/auth";

interface ProfileSectionProps {
  user: UserType | null;
  currentAvatar: string | null;
  isEditingName: boolean;
  editedName: string;
  isUpdatingName: boolean;
  isUploadingAvatar: boolean;
  setEditedName: (name: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveName: () => void;
  onAvatarUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSignOut: () => void;
}

export function ProfileSection({
  user,
  currentAvatar,
  isEditingName,
  editedName,
  isUpdatingName,
  isUploadingAvatar,
  setEditedName,
  onStartEdit,
  onCancelEdit,
  onSaveName,
  onAvatarUpload,
  onSignOut,
}: ProfileSectionProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium text-foreground">Profile</h2>
      <div className="p-4 border border-border rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative group">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-muted border border-border/30 cursor-pointer">
                {currentAvatar || user?.image ? (
                  <img
                    src={currentAvatar || user?.image || ""}
                    alt={user?.name || "User"}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-muted">
                    <User className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
              </div>

              <label
                htmlFor="avatar-upload"
                className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                {isUploadingAvatar ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                ) : (
                  <Camera className="h-4 w-4 text-white" />
                )}
              </label>

              <input
                id="avatar-upload"
                type="file"
                accept="image/*"
                onChange={onAvatarUpload}
                className="hidden"
                disabled={isUploadingAvatar}
              />
            </div>
            <div>
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    className="font-medium"
                    disabled={isUpdatingName}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={onSaveName}
                    disabled={isUpdatingName || !editedName.trim()}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={onCancelEdit}
                    disabled={isUpdatingName}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-foreground">
                    {user?.name || "User"}
                  </h3>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={onStartEdit}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                {user?.email}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onSignOut}
            className="border-border hover:border-border/80"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}