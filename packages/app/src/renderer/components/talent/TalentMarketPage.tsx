import { Badge } from "@/renderer/components/ui/badge";
import { Button } from "@/renderer/components/ui/button";
import { Input } from "@/renderer/components/ui/input";
import {
  AGENT_TEMPLATES,
  hireTemplate,
  isHired,
  matchesQuery,
  type AgentTemplate,
} from "@/renderer/libs/agent-templates";
import { useAgents } from "@/renderer/libs/db";
import { Check, Search, SearchX, UserPlus } from "lucide-react";
import React, { useState } from "react";
import { toast } from "sonner";
import { HireDialog } from "./hire-dialog";
import { MemberAvatar } from "@/renderer/components/common/member-avatar";
import { TEMPLATE_AVATARS } from "@/renderer/libs/template-avatars";

function TalentCard({
  template,
  hired,
  onHire,
}: {
  template: AgentTemplate;
  hired: boolean;
  onHire: (template: AgentTemplate) => void;
}) {
  return (
    <div className="bg-card text-card-foreground border border-border rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <MemberAvatar
          member={{
            id: template.id,
            workspaceId: "",
            kind: "agent",
            name: template.name,
            avatar: TEMPLATE_AVATARS[template.id] ?? template.avatar,
            agentId: null,
            status: "idle",
          }}
          className="size-10 text-base"
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium truncate">{template.name}</h3>
          <p className="text-xs text-muted-foreground truncate">
            {template.role}
          </p>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">{template.description}</p>

      <div className="flex flex-wrap gap-1.5">
        {template.tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="font-normal">
            {tag}
          </Badge>
        ))}
      </div>

      <Button
        size="sm"
        disabled={hired}
        onClick={() => onHire(template)}
        className="mt-auto bg-primary text-primary-foreground"
      >
        {hired ? (
          <>
            <Check className="h-4 w-4" />
            Hired
          </>
        ) : (
          <>
            <UserPlus className="h-4 w-4" />
            Hire
          </>
        )}
      </Button>
    </div>
  );
}

export function TalentMarketPage() {
  const agents = useAgents();
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<AgentTemplate | null>(null);

  const visible = AGENT_TEMPLATES.filter((t) => matchesQuery(t, query));

  const confirmHire = async (channelIds: string[]) => {
    if (!pending) return;
    const template = pending;
    setPending(null);
    try {
      await hireTemplate(template, channelIds);
      toast.success(
        channelIds.length
          ? `${template.name} joined ${channelIds.length} channel${
              channelIds.length === 1 ? "" : "s"
            }`
          : `${template.name} joined your workspace`,
      );
    } catch (err) {
      toast.error(
        `Could not hire ${template.name}: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      );
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground mb-2">
          Talent Market
        </h1>
        <p className="text-muted-foreground">
          Hire an agent into your workspace. Each one arrives with its own
          persona and joins the roster as a member.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, role, or tag"
          aria-label="Search talent"
          className="pl-9"
        />
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <SearchX size={28} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No talent matches “{query}”.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((template) => (
            <TalentCard
              key={template.id}
              template={template}
              hired={isHired(template, agents ?? [])}
              onHire={setPending}
            />
          ))}
        </div>
      )}

      <HireDialog
        template={pending}
        onConfirm={(channelIds) => void confirmHire(channelIds)}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      />
    </div>
  );
}
