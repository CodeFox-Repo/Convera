import type {
  MemoryCandidate,
  MemoryCandidateSink,
  MemoryScope,
} from "./types";
import { sameMemoryScope } from "./types";
import { MemoryError } from "./errors";
import { AtomicJsonFile } from "./json-file";
import { SerialTaskQueue } from "./serial-queue";

export interface MemoryCandidateRepository extends MemoryCandidateSink {
  listByTurn(turnId: string): Promise<MemoryCandidate[]>;
  deleteByIds(ids: string[]): Promise<void>;
  deleteByTurn(turnId: string): Promise<void>;
  deleteByScope(scope: MemoryScope): Promise<void>;
}

export class InMemoryMemoryCandidateRepository
  implements MemoryCandidateRepository
{
  private readonly candidates = new Map<string, MemoryCandidate>();

  async enqueue(candidate: MemoryCandidate): Promise<void> {
    if (!this.candidates.has(candidate.id)) {
      this.candidates.set(candidate.id, structuredClone(candidate));
    }
  }

  async listByTurn(turnId: string): Promise<MemoryCandidate[]> {
    return [...this.candidates.values()]
      .filter(
        (candidate) =>
          candidate.turnId === turnId ||
          candidate.turnId.startsWith(`${turnId}:memory:`),
      )
      .map((candidate) => structuredClone(candidate));
  }

  async deleteByTurn(turnId: string): Promise<void> {
    for (const [id, candidate] of this.candidates) {
      if (
        candidate.turnId === turnId ||
        candidate.turnId.startsWith(`${turnId}:memory:`)
      ) {
        this.candidates.delete(id);
      }
    }
  }

  async deleteByIds(ids: string[]): Promise<void> {
    for (const id of ids) this.candidates.delete(id);
  }

  async deleteByScope(scope: MemoryScope): Promise<void> {
    for (const [id, candidate] of this.candidates) {
      if (sameMemoryScope(candidate.scope, scope)) this.candidates.delete(id);
    }
  }
}

interface PersistedMemoryCandidates {
  schemaVersion: 1;
  candidates: MemoryCandidate[];
}

function assertPersistedCandidates(
  value: unknown,
): asserts value is PersistedMemoryCandidates {
  if (
    typeof value !== "object" ||
    value === null ||
    (value as { schemaVersion?: unknown }).schemaVersion !== 1 ||
    !Array.isArray((value as { candidates?: unknown }).candidates)
  ) {
    throw new MemoryError(
      "Memory candidate state has an unsupported or invalid schema.",
      "VALIDATION",
      false,
    );
  }
}

export class JsonMemoryCandidateRepository
  implements MemoryCandidateRepository
{
  private readonly file: AtomicJsonFile;
  private readonly writes = new SerialTaskQueue();

  constructor(options: { path: string }) {
    this.file = new AtomicJsonFile(options.path);
  }

  private async readState(): Promise<PersistedMemoryCandidates> {
    const value = await this.file.read();
    if (value === undefined) return { schemaVersion: 1, candidates: [] };
    assertPersistedCandidates(value);
    return structuredClone(value);
  }

  async enqueue(candidate: MemoryCandidate): Promise<void> {
    await this.writes.run(async () => {
      const state = await this.readState();
      if (!state.candidates.some((existing) => existing.id === candidate.id)) {
        state.candidates.push(structuredClone(candidate));
        await this.file.write(state);
      }
    });
  }

  async listByTurn(turnId: string): Promise<MemoryCandidate[]> {
    const state = await this.readState();
    return state.candidates
      .filter(
        (candidate) =>
          candidate.turnId === turnId ||
          candidate.turnId.startsWith(`${turnId}:memory:`),
      )
      .map((candidate) => structuredClone(candidate));
  }

  async deleteByTurn(turnId: string): Promise<void> {
    await this.writes.run(async () => {
      const state = await this.readState();
      const next = state.candidates.filter(
        (candidate) =>
          candidate.turnId !== turnId &&
          !candidate.turnId.startsWith(`${turnId}:memory:`),
      );
      if (next.length === state.candidates.length) return;
      state.candidates = next;
      await this.file.write(state);
    });
  }

  async deleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const targets = new Set(ids);
    await this.writes.run(async () => {
      const state = await this.readState();
      const next = state.candidates.filter(
        (candidate) => !targets.has(candidate.id),
      );
      if (next.length === state.candidates.length) return;
      state.candidates = next;
      await this.file.write(state);
    });
  }

  async deleteByScope(scope: MemoryScope): Promise<void> {
    await this.writes.run(async () => {
      const state = await this.readState();
      const next = state.candidates.filter(
        (candidate) => !sameMemoryScope(candidate.scope, scope),
      );
      if (next.length === state.candidates.length) return;
      state.candidates = next;
      await this.file.write(state);
    });
  }
}
