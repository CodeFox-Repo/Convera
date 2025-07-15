import { useState, useEffect } from "react";
import { authClient } from "@/renderer/libs/auth-client";
import { useUpdateUser } from "@/renderer/libs/hooks/auth-hooks";
import { getBaseUrl } from "@/renderer/libs/env";
import { User } from "@/renderer/types/auth";

export function useAccountProfile() {
  const { data: session } = authClient.useSession();
  const { signOut } = authClient;
  const updateUser = useUpdateUser();
  
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [currentAvatar, setCurrentAvatar] = useState<string | null>(null);

  const user: User | null = session?.user || null;

  // Initialize current avatar from session
  useEffect(() => {
    if (user?.image) {
      setCurrentAvatar(user.image);
    }
  }, [user?.image]);

  const handleSignOut = async () => {
    try {
      await signOut();
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
      await updateUser.mutateAsync({ name: editedName.trim() });
      setIsEditingName(false);
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

      const uploadResponse = await fetch(
        `${getBaseUrl()}/api/users/avatar?uploadOnly=true`,
        {
          method: "POST",
          credentials: "include",
          body: formData,
        },
      );

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload file");
      }

      const uploadResult = await uploadResponse.json();
      const avatarUrl = uploadResult.avatarUrl;

      setCurrentAvatar(avatarUrl);
      await updateUser.mutateAsync({ image: avatarUrl });
    } catch (error) {
      console.error("Avatar upload error:", error);
      alert("Failed to upload avatar");
      setCurrentAvatar(user?.image || null);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  return {
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
  };
}