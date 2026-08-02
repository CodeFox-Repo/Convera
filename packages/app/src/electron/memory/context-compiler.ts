import { memoryScopeKey, type MemoryBlock, type MemorySnapshot } from "./types";

export interface MemoryContextBudget {
  maxCharacters: number;
  maxTokens: number;
  charactersPerToken?: number;
}

export interface NativeMemoryCursor {
  version: number;
  epoch: number;
}

export interface NativeMemorySessionState {
  isNew: boolean;
  seen: Record<string, NativeMemoryCursor | undefined>;
}

export interface CompileMemoryContextInput {
  snapshots: MemorySnapshot[];
  session: NativeMemorySessionState;
  budget: MemoryContextBudget;
}

export interface CompiledMemoryContext {
  mode: "bootstrap" | "delta" | "none" | "epoch_reset";
  context: string;
  cursors: Record<string, NativeMemoryCursor>;
  requiresNewSession: boolean;
  truncated: boolean;
  includedBlocks: string[];
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function attributes(values: Record<string, string | number>): string {
  return Object.entries(values)
    .map(([key, value]) => ` ${key}="${escapeXml(String(value))}"`)
    .join("");
}

function effectiveCharacterBudget(budget: MemoryContextBudget): number {
  const charactersPerToken = Math.max(budget.charactersPerToken ?? 4, 1);
  return Math.max(
    0,
    Math.min(
      Math.floor(budget.maxCharacters),
      Math.floor(budget.maxTokens * charactersPerToken),
    ),
  );
}

class BoundedContext {
  private readonly pieces: string[] = [];
  private length = 0;
  truncated = false;
  truncationCount = 0;

  constructor(private readonly limit: number) {}

  add(value: string, reserve = 0): boolean {
    const separatorLength = this.pieces.length > 0 ? 1 : 0;
    if (this.length + separatorLength + value.length + reserve > this.limit) {
      this.truncated = true;
      this.truncationCount += 1;
      return false;
    }
    this.pieces.push(value);
    this.length += separatorLength + value.length;
    return true;
  }

  addTextElement(
    tag: string,
    text: string,
    elementAttributes: Record<string, string | number>,
    reserve = 0,
  ): boolean {
    const open = `<${tag}${attributes(elementAttributes)}>`;
    const close = `</${tag}>`;
    const separatorLength = this.pieces.length > 0 ? 1 : 0;
    const available =
      this.limit -
      this.length -
      separatorLength -
      open.length -
      close.length -
      reserve;
    if (available <= 0) {
      this.truncated = true;
      this.truncationCount += 1;
      return false;
    }
    const escaped = escapeXml(text);
    if (escaped.length <= available) {
      return this.add(`${open}${escaped}${close}`, reserve);
    }
    this.truncated = true;
    this.truncationCount += 1;
    const suffix = "…";
    const target = Math.max(available - suffix.length, 0);
    let clipped = "";
    for (const character of text) {
      const encoded = escapeXml(character);
      if (clipped.length + encoded.length > target) break;
      clipped += encoded;
    }
    return this.add(`${open}${clipped}${suffix}${close}`, reserve);
  }

  toString(): string {
    return this.pieces.join("\n");
  }
}

function sortBlocks(blocks: MemoryBlock[]): MemoryBlock[] {
  return [...blocks].sort((left, right) => {
    const priority = (label: string): number => {
      if (label === "current_goal") return 0;
      if (label === "decisions") return 1;
      if (label === "working_state") return 2;
      if (label === "identity") return 3;
      if (label === "preferences") return 4;
      return 10;
    };
    return (
      priority(left.label) - priority(right.label) ||
      left.label.localeCompare(right.label)
    );
  });
}

function blockAttributes(block: MemoryBlock): Record<string, string | number> {
  return {
    label: block.label,
    version: block.version,
    ...(block.readOnly ? { read_only: "true" } : {}),
  };
}

export class MemoryContextCompiler {
  compile(input: CompileMemoryContextInput): CompiledMemoryContext {
    const limit = effectiveCharacterBudget(input.budget);
    const epochMismatch = input.snapshots.some((snapshot) => {
      const seen = input.session.seen[memoryScopeKey(snapshot.scope)];
      return seen !== undefined && seen.epoch !== snapshot.epoch;
    });
    const cursors: Record<string, NativeMemoryCursor> = {};
    for (const [key, cursor] of Object.entries(input.session.seen)) {
      if (cursor) cursors[key] = { ...cursor };
    }
    if (limit === 0 || input.snapshots.length === 0) {
      return {
        mode: epochMismatch ? "epoch_reset" : "none",
        context: "",
        cursors,
        requiresNewSession: epochMismatch,
        truncated: input.snapshots.length > 0,
        includedBlocks: [],
      };
    }

    const isBootstrap = input.session.isNew || epochMismatch;

    if (!isBootstrap) {
      const changed = input.snapshots.some((snapshot) => {
        const seen = input.session.seen[memoryScopeKey(snapshot.scope)];
        return !seen || seen.version !== snapshot.version;
      });
      if (!changed) {
        for (const snapshot of input.snapshots) {
          cursors[memoryScopeKey(snapshot.scope)] = {
            version: snapshot.version,
            epoch: snapshot.epoch,
          };
        }
        return {
          mode: "none",
          context: "",
          cursors,
          requiresNewSession: false,
          truncated: false,
          includedBlocks: [],
        };
      }
    }

    const bounded = new BoundedContext(limit);
    const includedBlocks: string[] = [];
    const mode = epochMismatch
      ? "epoch_reset"
      : isBootstrap
        ? "bootstrap"
        : "delta";
    const rootOpen = `<convera_memory mode="${mode}">`;
    const rootClose = "</convera_memory>";
    const rootClosingReserve = rootClose.length + 1;
    if (!bounded.add(rootOpen, rootClosingReserve)) {
      return {
        mode,
        context: "",
        cursors,
        requiresNewSession: epochMismatch,
        truncated: true,
        includedBlocks,
      };
    }

    for (const snapshot of input.snapshots) {
      const key = memoryScopeKey(snapshot.scope);
      const seen = input.session.seen[key];
      const scopeAttributes: Record<string, string | number> = {
        kind: snapshot.scope.kind,
        id: snapshot.scope.id,
        epoch: snapshot.epoch,
        from_version: isBootstrap ? 0 : (seen?.version ?? 0),
        to_version: snapshot.version,
      };
      if (snapshot.stale) scopeAttributes.stale = "true";
      const scopeOpen = `<scope${attributes(scopeAttributes)}>`;
      const scopeClose = "</scope>";
      const scopeClosingReserve = scopeClose.length + rootClose.length + 2;
      if (!bounded.add(scopeOpen, scopeClosingReserve)) {
        continue;
      }
      const truncationsBeforeScope = bounded.truncationCount;

      if (isBootstrap) {
        if (snapshot.checkpoint) {
          bounded.addTextElement(
            "checkpoint",
            snapshot.checkpoint,
            {},
            scopeClosingReserve,
          );
        }
        for (const block of sortBlocks(snapshot.blocks)) {
          if (
            bounded.addTextElement(
              "block",
              block.value,
              blockAttributes(block),
              scopeClosingReserve,
            )
          ) {
            includedBlocks.push(`${key}/${block.label}`);
          }
        }
      } else {
        const fromVersion = seen?.version ?? 0;
        const deltas = snapshot.deltas.filter(
          (delta) =>
            delta.epoch === snapshot.epoch &&
            delta.version > fromVersion &&
            delta.version <= snapshot.version,
        );
        const historyCoversGap =
          fromVersion === snapshot.version ||
          deltas.some((delta) => delta.version === fromVersion + 1);

        if (!historyCoversGap) {
          bounded.add(
            '<resync reason="delta_history_unavailable">Current authoritative block values follow.</resync>',
            scopeClosingReserve,
          );
          for (const block of sortBlocks(snapshot.blocks)) {
            if (
              bounded.addTextElement(
                "block",
                block.value,
                blockAttributes(block),
                scopeClosingReserve,
              )
            ) {
              includedBlocks.push(`${key}/${block.label}`);
            }
          }
        } else {
          const changed = new Set(
            deltas.flatMap((delta) => delta.changedBlockLabels),
          );
          for (const delta of deltas) {
            bounded.addTextElement(
              "change",
              delta.summary,
              {
                version: delta.version,
                turn_id: delta.turnId,
              },
              scopeClosingReserve,
            );
          }
          for (const block of sortBlocks(snapshot.blocks)) {
            if (!changed.has(block.label)) continue;
            if (
              bounded.addTextElement(
                "block",
                block.value,
                blockAttributes(block),
                scopeClosingReserve,
              )
            ) {
              includedBlocks.push(`${key}/${block.label}`);
            }
          }
        }
      }
      bounded.add(scopeClose, rootClosingReserve);
      if (bounded.truncationCount === truncationsBeforeScope) {
        cursors[key] = {
          version: snapshot.version,
          epoch: snapshot.epoch,
        };
      }
    }
    bounded.add(rootClose);

    return {
      mode,
      context: bounded.toString(),
      cursors,
      requiresNewSession: epochMismatch,
      truncated: bounded.truncated,
      includedBlocks,
    };
  }
}
