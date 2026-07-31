import { MemberAvatar } from "@/renderer/components/common/member-avatar";
import { Button } from "@/renderer/components/ui/button";
import { Input } from "@/renderer/components/ui/input";
import {
  LOCAL_HUMAN_MEMBER_ID,
  updateMemberProfile,
  useMember,
} from "@/renderer/libs/stores/member-store";
import { Loader2 } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { fileToAvatarDataUrl, normalizeDisplayName } from "./profile-avatar";

export function ProfileSection() {
  const member = useMember(LOCAL_HUMAN_MEMBER_ID);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [draftName, setDraftName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The stored name is the source of truth; the draft only exists mid-edit.
  useEffect(() => {
    if (draftName === null && member) setDraftName(member.name);
  }, [member, draftName]);

  const name = draftName ?? "";
  const trimmedName = normalizeDisplayName(name);

  const commitName = async () => {
    if (!member) return;
    if (!trimmedName) {
      setDraftName(member.name);
      return;
    }
    if (trimmedName === member.name) return;
    await updateMemberProfile(member.id, { name: trimmedName });
    setDraftName(trimmedName);
  };

  const pickAvatar = async (file: File | undefined) => {
    if (!file || !member) return;
    setBusy(true);
    setError(null);
    try {
      await updateMemberProfile(member.id, {
        avatar: await fileToAvatarDataUrl(file),
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not read that image.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium text-foreground">Profile</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          How you appear in channels and chats. Stored only on this device.
        </p>
      </div>

      <div className="border border-border rounded-lg divide-y divide-border">
        <div className="flex items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-3">
            <MemberAvatar member={member} className="size-12 text-base" />
            <div>
              <span className="font-medium text-foreground">Avatar</span>
              <p className="text-xs text-muted-foreground">
                A square crop is stored at 128px.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {busy && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                void pickAvatar(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !member}
              onClick={() => fileInputRef.current?.click()}
              className="border-border"
            >
              Choose image
            </Button>
            {member?.avatar && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void updateMemberProfile(member.id, { avatar: null })
                }
              >
                Remove
              </Button>
            )}
          </div>
        </div>

        <label className="flex items-center justify-between gap-4 p-4">
          <div>
            <span className="font-medium text-foreground">Display name</span>
            <p className="text-xs text-muted-foreground">
              {error ?? "Shown on your messages and in the member list."}
            </p>
          </div>
          <Input
            value={name}
            disabled={!member}
            aria-label="Display name"
            aria-invalid={!trimmedName}
            maxLength={64}
            onChange={(event) => setDraftName(event.target.value)}
            onBlur={() => void commitName()}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            className="w-56 bg-transparent"
          />
        </label>
      </div>
    </div>
  );
}
