import { cn } from "@/renderer/libs/utils/tailwind";
import {
  clearChatHistory,
  readWorkspaceCounts,
  reseedStarterTeam,
  resetWorkspace,
  type WorkspaceCounts,
} from "@/renderer/libs/dev-reset";
import { useLiveQuery } from "dexie-react-hooks";
import { FlaskConical, X } from "lucide-react";
import React, { useState } from "react";

type ActionId = "clear-history" | "reset-workspace" | "reseed";

const ACTIONS: Array<{
  id: ActionId;
  label: string;
  hint: string;
  destructive: boolean;
  run: () => Promise<void>;
}> = [
  {
    id: "clear-history",
    label: "Clear chat history",
    hint: "Keeps members, agents and channels",
    destructive: true,
    run: clearChatHistory,
  },
  {
    id: "reset-workspace",
    label: "Reset workspace",
    hint: "Deletes the database and reloads",
    destructive: true,
    run: resetWorkspace,
  },
  {
    id: "reseed",
    label: "Re-seed starter team",
    hint: "Fills in missing agents and channels",
    destructive: false,
    run: reseedStarterTeam,
  },
];

function CountsReadout({ counts }: { counts: WorkspaceCounts | undefined }) {
  const rows: Array<[string, number | undefined]> = [
    ["conversations", counts?.conversations],
    ["messages", counts?.messages],
    ["channels", counts?.channels],
    ["agents", counts?.agents],
  ];

  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-2">
          <dt className="truncate">{label}</dt>
          <dd className="font-mono tabular-nums text-foreground">
            {value ?? "–"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function DevResetDock() {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState<ActionId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const counts = useLiveQuery(readWorkspaceCounts);

  const close = () => {
    setOpen(false);
    setArmed(null);
    setError(null);
  };

  const activate = async (action: (typeof ACTIONS)[number]) => {
    if (action.destructive && armed !== action.id) {
      setArmed(action.id);
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await action.run();
      setArmed(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    // Raised clear of the composer: its box tops out around 120px plus 16px of
    // padding, and its send button sits in exactly this corner.
    <div className="pointer-events-none fixed right-4 bottom-36 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="pointer-events-auto w-60 rounded-xl border border-border bg-background p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Dev reset
            </span>
            <button
              type="button"
              onClick={close}
              aria-label="Close dev reset"
              className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
            >
              <X size={12} />
            </button>
          </div>

          <CountsReadout counts={counts} />

          <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
            {ACTIONS.map((action) => {
              const isArmed = armed === action.id;
              return (
                <button
                  key={action.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void activate(action)}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-left text-xs transition-colors disabled:opacity-50",
                    isArmed
                      ? "bg-destructive/15 text-destructive"
                      : "text-foreground hover:bg-sidebar-accent",
                  )}
                >
                  <span className="block">
                    {isArmed ? "Click again to confirm" : action.label}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">
                    {isArmed ? action.label : action.hint}
                  </span>
                </button>
              );
            })}
          </div>

          {error && (
            <p className="mt-2 text-[10px] break-words text-destructive">
              {error}
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label="Dev reset tools"
        title="Dev reset tools"
        className="pointer-events-auto flex size-8 items-center justify-center rounded-full border border-border text-muted-foreground opacity-40 shadow-sm backdrop-blur-md transition-opacity hover:text-foreground hover:opacity-100"
      >
        <FlaskConical size={14} />
      </button>
    </div>
  );
}
