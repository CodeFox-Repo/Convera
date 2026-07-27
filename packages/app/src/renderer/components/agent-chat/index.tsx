import { Button } from "@/renderer/components/ui/button";
import {
  useAgentChat,
  type AgentEntry,
} from "@/renderer/libs/stores/agent-chat-store";
import { cn } from "@/renderer/libs/utils/tailwind";
import React, { useEffect, useRef, useState } from "react";

/**
 * The agent chat page.
 *
 * Runs on the local agent core — the user's own Claude credentials, this Mac as a tool —
 * and nothing typed here reaches a server of ours. It exists alongside the old remote chat
 * rather than replacing it in place, so both can be run side by side until this one wins.
 */
export function AgentChatPage() {
  const {
    entries,
    running,
    approval,
    model,
    start,
    stop,
    answerApproval,
    clear,
    subscribe,
  } = useAgentChat();
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => subscribe(), [subscribe]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length, approval]);

  const submit = () => {
    const prompt = draft.trim();
    if (!prompt || running) return;
    setDraft("");
    void start(prompt);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 px-4 py-2 text-xs opacity-60">
        <span>local agent</span>
        {model && <span className="font-mono">{model}</span>}
        <span className="ml-auto" />
        {entries.length > 0 && (
          <button
            className="underline-offset-2 hover:underline"
            onClick={clear}
          >
            clear
          </button>
        )}
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4">
        {entries.length === 0 && (
          <p className="pt-8 text-center text-sm opacity-50">
            Ask it to do something on this Mac. It will ask before it touches
            anything.
          </p>
        )}
        {entries.map((entry) => (
          <Entry key={entry.id} entry={entry} />
        ))}
        <div ref={bottom} />
      </div>

      {approval && (
        <ApprovalPrompt
          summary={approval.summary}
          app={approval.frontmostApp}
          onAnswer={(granted) => void answerApproval(granted)}
        />
      )}

      <div className="flex items-end gap-2 border-t border-white/10 px-4 py-3">
        <textarea
          className="max-h-40 min-h-[2.5rem] flex-1 resize-none rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-white/25"
          placeholder={running ? "working…" : "What should it do?"}
          value={draft}
          rows={1}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        {running ? (
          <Button variant="ghost" onClick={() => void stop()}>
            Stop
          </Button>
        ) : (
          <Button onClick={submit} disabled={!draft.trim()}>
            Send
          </Button>
        )}
      </div>
    </div>
  );
}

function Entry({ entry }: { entry: AgentEntry }) {
  if (entry.kind === "text") {
    return (
      <div className={cn("text-sm", entry.role === "user" && "text-right")}>
        <span
          className={cn(
            "inline-block max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-left",
            entry.role === "user" ? "border border-white/15" : "opacity-90",
          )}
        >
          {entry.text}
        </span>
      </div>
    );
  }

  if (entry.kind === "tool") {
    const label = entry.name.replace(/^mcp__desktop__/, "");
    return (
      <div className="flex items-center gap-2 font-mono text-xs opacity-70">
        <span
          className={cn(
            "inline-block h-1.5 w-1.5 rounded-full",
            entry.outcome === "denied" && "bg-red-400",
            entry.outcome === "pending" && "bg-amber-400",
            entry.outcome === "allowed" && "bg-emerald-400",
          )}
        />
        <span>{label}</span>
        {entry.outcome === "denied" && (
          <span className="opacity-60">declined</span>
        )}
      </div>
    );
  }

  return (
    <p
      className={cn(
        "text-xs",
        entry.tone === "error" ? "text-red-400" : "opacity-50",
      )}
    >
      {entry.text}
    </p>
  );
}

/**
 * The one thing a terminal host genuinely cannot do: tell you what is about to happen to
 * your screen while your attention is on another app, and let you stop it.
 */
function ApprovalPrompt({
  summary,
  app,
  onAnswer,
}: {
  summary: string;
  app: string;
  onAnswer: (granted: boolean) => void;
}) {
  return (
    <div className="mx-4 mb-2 rounded-lg border border-amber-400/40 px-3 py-2">
      <p className="text-sm">
        About to <span className="font-medium">{summary}</span>
      </p>
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" onClick={() => onAnswer(true)}>
          Allow
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onAnswer(false)}>
          Deny
        </Button>
        <span className="ml-auto text-xs opacity-50">{app} is frontmost</span>
      </div>
    </div>
  );
}
