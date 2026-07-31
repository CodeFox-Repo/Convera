import { BaseLogo } from "@/renderer/components/common/base-logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/renderer/components/ui/dropdown-menu";
import {
  createGroup,
  renameWorkspace,
  useWorkspace,
} from "@/renderer/libs/stores/channel-store";
import { Bot, ChevronDown, FolderPlus, Pencil } from "lucide-react";
import React, { useState } from "react";
import { InlineNameInput } from "./InlineNameInput";

/**
 * Top of the sidebar hierarchy: the workspace owns the groups, which own the
 * channels. Its menu holds the actions that belong to the whole space rather
 * than to one room — managing colleagues, adding a group.
 */
export function WorkspaceTitle({
  onManageAgents,
}: {
  onManageAgents: () => void;
}) {
  const workspace = useWorkspace();
  const [isRenaming, setIsRenaming] = useState(false);

  if (isRenaming) {
    return (
      <InlineNameInput
        placeholder="Workspace name"
        initialValue={workspace?.name ?? ""}
        onSubmit={(name) => {
          void renameWorkspace(name);
          setIsRenaming(false);
        }}
        onCancel={() => setIsRenaming(false)}
      />
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="group flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-sidebar-hover pointer-events-auto">
          {workspace?.icon ? (
            <span className="flex-shrink-0 text-base leading-none">
              {workspace.icon}
            </span>
          ) : (
            <BaseLogo size={18} className="flex-shrink-0" />
          )}
          <h1 className="min-w-0 truncate text-sm font-semibold text-sidebar-foreground">
            {workspace?.name ?? "Personal"}
          </h1>
          <ChevronDown
            size={12}
            className="flex-shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuItem onClick={onManageAgents}>
          <Bot size={14} />
          <span>Manage agents</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void createGroup("New group")}>
          <FolderPlus size={14} />
          <span>New group</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setIsRenaming(true)}>
          <Pencil size={14} />
          <span>Rename workspace</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
