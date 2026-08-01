/**
 * What each agent turn actually did, on disk.
 *
 * "Three colleagues showed as typing and one answered" is a question about
 * events that leave no trace anywhere else: the room shows a message or it
 * shows nothing, and a turn that opened the speech tool and abandoned it
 * looks identical to one that was never asked.
 *
 * This lives in the main process and writes a plain JSONL file, deliberately:
 * the renderer's IndexedDB is reachable only from inside the browser, so a
 * log kept there cannot be read while diagnosing — by a script, by a support
 * request, or by anyone who is not sitting in front of the open devtools.
 */
import { appendFile, readFile, writeFile } from "node:fs/promises";
import type { LocalAIStreamEvent } from "@/shared/types/local-ai";

export interface TurnLogStep {
  /** Bare tool name — `send_message`, `read_channel` — or `(re-asked)`. */
  tool: string;
  /** Milliseconds from the turn's first event. */
  at: number;
  outcome: "started" | "completed" | "error" | "denied" | "note";
  detail?: string;
}

export interface TurnLogEntry {
  at: string;
  jobId: string;
  requestId: string;
  conversationId: string;
  memberId: string;
  mode: string;
  steps: TurnLogStep[];
  spoke: boolean;
  /** The turn's own output: invisible to the room, and usually the reason. */
  turnText?: string;
  error?: string;
  durationMs: number;
}

const TURN_TEXT_MAX = 400;
const DETAIL_MAX = 160;
/** Rewritten when it grows past this, keeping the newest half. */
const MAX_LINES = 500;

function toolNameOf(chunk: unknown): string | undefined {
  const name = (chunk as { toolName?: string }).toolName;
  return typeof name === "string" ? name.replace(/^workspace:/, "") : undefined;
}

/**
 * Accumulates one turn. The executor owns the lifetime: it sees every stream
 * event already, so nothing extra has to be plumbed through.
 */
export class TurnLogger {
  private readonly startedAt = Date.now();
  private readonly steps: TurnLogStep[] = [];
  private readonly toolNames = new Map<string, string>();
  private turnText = "";
  private spoke = false;
  private error?: string;

  constructor(private readonly path: string) {}

  record(event: LocalAIStreamEvent): void {
    const at = Date.now() - this.startedAt;

    if (event.type === "error") {
      this.error = event.error.message;
      return;
    }

    if (event.type === "interaction") {
      const input = event.input as { kind?: string; content?: string } | null;
      if (input?.kind === "send_message") {
        this.spoke = true;
        const step = this.lastStarted("send_message");
        if (step) step.detail = (input.content ?? "").slice(0, DETAIL_MAX);
      }
      return;
    }

    if (event.type !== "ui-message") return;
    const chunk = event.chunk as {
      type?: string;
      delta?: string;
      toolCallId?: string;
      errorText?: string;
    };

    if (chunk.type === "text-delta" && typeof chunk.delta === "string") {
      this.turnText = (this.turnText + chunk.delta).slice(0, TURN_TEXT_MAX);
      return;
    }

    const callId = chunk.toolCallId;
    if (typeof callId !== "string" || !callId) return;

    if (chunk.type === "tool-input-start") {
      const tool = toolNameOf(chunk) ?? "unknown";
      this.toolNames.set(callId, tool);
      this.steps.push({ tool, at, outcome: "started" });
      return;
    }

    const tool = this.toolNames.get(callId);
    if (!tool) return;
    const step = this.lastStarted(tool);
    if (!step) return;

    if (chunk.type === "tool-output-available") step.outcome = "completed";
    else if (chunk.type === "tool-output-denied") step.outcome = "denied";
    else if (
      chunk.type === "tool-output-error" ||
      chunk.type === "tool-input-error"
    ) {
      step.outcome = "error";
      if (typeof chunk.errorText === "string") {
        step.detail = chunk.errorText.slice(0, DETAIL_MAX);
      }
    }
  }

  /** Marks where a silent direct offer was asked again. */
  noteRetry(): void {
    this.steps.push({
      tool: "(re-asked)",
      at: Date.now() - this.startedAt,
      outcome: "note",
      detail: "ended without speaking, so it was asked once more",
    });
  }

  async flush(job: {
    id: string;
    requestId: string;
    conversationId: string;
    memberId: string;
    mode: string;
  }): Promise<void> {
    const entry: TurnLogEntry = {
      at: new Date().toISOString(),
      jobId: job.id,
      requestId: job.requestId,
      conversationId: job.conversationId,
      memberId: job.memberId,
      mode: job.mode,
      steps: this.steps,
      spoke: this.spoke,
      ...(this.turnText.trim() ? { turnText: this.turnText.trim() } : {}),
      ...(this.error ? { error: this.error } : {}),
      durationMs: Date.now() - this.startedAt,
    };
    try {
      await appendFile(this.path, `${JSON.stringify(entry)}\n`, "utf8");
      await this.trim();
    } catch {
      // A diagnostic must never break the turn it was watching.
    }
  }

  private lastStarted(tool: string): TurnLogStep | undefined {
    for (let index = this.steps.length - 1; index >= 0; index -= 1) {
      const step = this.steps[index];
      if (step.tool === tool && step.outcome === "started") return step;
    }
    return undefined;
  }

  private async trim(): Promise<void> {
    const lines = (await readFile(this.path, "utf8")).split("\n");
    if (lines.length <= MAX_LINES) return;
    await writeFile(this.path, lines.slice(-MAX_LINES / 2).join("\n"), "utf8");
  }
}
