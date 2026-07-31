import { Badge } from "@/renderer/components/ui/badge";
import { Button } from "@/renderer/components/ui/button";
import {
  ensureLocalHumanMember,
  fireAgent,
} from "@/renderer/libs/agent-templates";
import { useAgents } from "@/renderer/libs/db";
import { useMembers, type Member } from "@/renderer/libs/stores/member-store";
import { cn } from "@/renderer/libs/utils/tailwind";
import { UserMinus } from "lucide-react";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "./confirm-dialog";
import { MemberAvatar } from "@/renderer/components/common/member-avatar";

const ORG_NAME = "Personal Workspace";

function RosterRow({
  member,
  description,
  canFire,
  onFire,
}: {
  member: Member;
  description: string | null;
  canFire: boolean;
  onFire: (member: Member) => void;
}) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-border last:border-b-0">
      <MemberAvatar member={member} className="size-9 text-sm" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "size-2 rounded-full flex-shrink-0",
              member.status === "working" ? "bg-primary" : "bg-muted",
            )}
            title={member.status}
            aria-label={member.status}
          />
          <span className="text-sm font-medium truncate">{member.name}</span>
          <Badge variant="secondary" className="font-normal">
            {member.kind}
          </Badge>
        </div>
        {description && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {description}
          </p>
        )}
      </div>

      {canFire && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onFire(member)}
          className="text-destructive hover:text-destructive"
          aria-label={`Remove ${member.name}`}
        >
          <UserMinus className="h-4 w-4" />
          Fire
        </Button>
      )}
    </div>
  );
}

export function OrgRosterPage() {
  const members = useMembers();
  const agents = useAgents();
  const [pending, setPending] = useState<Member | null>(null);

  useEffect(() => {
    void ensureLocalHumanMember();
  }, []);

  const roster = members ?? [];
  const humanCount = roster.filter((m) => m.kind === "human").length;
  const agentCount = roster.filter((m) => m.kind === "agent").length;

  const agentFor = (member: Member) =>
    member.agentId ? agents?.find((a) => a.id === member.agentId) : undefined;

  const confirmFire = async () => {
    const member = pending;
    setPending(null);
    if (!member?.agentId) return;
    try {
      await fireAgent(member.agentId);
      toast.success(`${member.name} left the workspace`);
    } catch (err) {
      toast.error(
        `Could not remove ${member.name}: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      );
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground mb-2">
          {ORG_NAME}
        </h1>
        <p className="text-muted-foreground">
          {humanCount} member{humanCount === 1 ? "" : "s"} · {agentCount} agent
          {agentCount === 1 ? "" : "s"}
        </p>
      </div>

      <div className="bg-card text-card-foreground border border-border rounded-lg px-4">
        {roster.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6">
            Nobody here yet. Hire someone from the Talent Market.
          </p>
        ) : (
          roster.map((member) => {
            const agent = agentFor(member);
            return (
              <RosterRow
                key={member.id}
                member={member}
                description={agent?.description ?? null}
                canFire={member.kind === "agent" && !!agent && !agent.isBuiltIn}
                onFire={setPending}
              />
            );
          })
        )}
      </div>

      <ConfirmDialog
        open={pending !== null}
        title={`Remove ${pending?.name ?? ""}?`}
        description={`${pending?.name ?? ""} is deleted from this workspace along with its identity. Existing messages keep their history.`}
        confirmLabel="Fire"
        destructive
        onConfirm={confirmFire}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      />
    </div>
  );
}
