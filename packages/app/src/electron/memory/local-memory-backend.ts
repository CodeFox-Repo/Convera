import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  BackendAgentCreate,
  BackendAgentRecord,
  BackendArchiveRecord,
  BackendBlockCreate,
  BackendBlockRecord,
  BackendBlockUpdate,
  BackendPassageCreate,
  BackendPassageRecord,
  BackendPassageSearch,
  MemoryBackend,
} from "./memory-backend";
import { AtomicJsonFile } from "./json-file";
import { SerialTaskQueue } from "./serial-queue";

const metadataSchema = z.record(z.string(), z.unknown()).nullable().optional();
const blockSchema = z.object({
  id: z.string(),
  label: z.string().nullable().optional(),
  value: z.string(),
  description: z.string().nullable().optional(),
  limit: z.number().optional(),
  metadata: metadataSchema,
  tags: z.array(z.string()).nullable().optional(),
});
const passageSchema = z.object({
  id: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
  createdAt: z.string().optional(),
});
const agentSchema = z.object({
  id: z.string(),
  name: z.string(),
  tags: z.array(z.string()),
  metadata: metadataSchema,
});
const archiveSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
});
const persistedSchema = z.object({
  schemaVersion: z.literal(1),
  agents: z.record(z.string(), agentSchema),
  blocks: z.record(z.string(), blockSchema),
  archives: z.record(z.string(), archiveSchema),
  passages: z.record(z.string(), z.record(z.string(), passageSchema)),
  archivePassages: z.record(z.string(), z.record(z.string(), passageSchema)),
});

type PersistedLocalMemory = z.infer<typeof persistedSchema>;

function emptyState(): PersistedLocalMemory {
  return {
    schemaVersion: 1,
    agents: {},
    blocks: {},
    archives: {},
    passages: {},
    archivePassages: {},
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function notFound(kind: string, id: string): Error {
  return Object.assign(new Error(`${kind} not found: ${id}`), {
    status: 404,
    statusCode: 404,
  });
}

function tagsMatch(
  actual: string[] | null | undefined,
  expected: string[] | undefined,
  matchAll: boolean,
): boolean {
  if (!expected?.length) return true;
  const tags = actual ?? [];
  return matchAll
    ? expected.every((tag) => tags.includes(tag))
    : expected.some((tag) => tags.includes(tag));
}

function queryTerms(query: string | undefined): string[] {
  return (query ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .split(/[\s\p{P}\p{S}]+/u)
    .filter(Boolean);
}

function searchPassages(
  records: BackendPassageRecord[],
  input: BackendPassageSearch,
): BackendPassageRecord[] {
  const normalizedQuery = (input.query ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .trim();
  const terms = queryTerms(input.query);
  const start = input.startDate ? Date.parse(input.startDate) : undefined;
  const end = input.endDate ? Date.parse(input.endDate) : undefined;
  return records
    .flatMap((passage) => {
      if (!tagsMatch(passage.tags, input.tags, true)) return [];
      const createdAt = passage.createdAt
        ? Date.parse(passage.createdAt)
        : undefined;
      if (
        start !== undefined &&
        Number.isFinite(start) &&
        (createdAt === undefined || createdAt < start)
      ) {
        return [];
      }
      if (
        end !== undefined &&
        Number.isFinite(end) &&
        (createdAt === undefined || createdAt > end)
      ) {
        return [];
      }
      const content = passage.content.normalize("NFKC").toLocaleLowerCase();
      const matchedTerms = terms.filter((term) => content.includes(term));
      if (terms.length > 0 && matchedTerms.length === 0) return [];
      const phraseBoost =
        normalizedQuery.length > 0 && content.includes(normalizedQuery) ? 1 : 0;
      const score =
        phraseBoost +
        (terms.length > 0 ? matchedTerms.length / terms.length : 1);
      return [{ ...clone(passage), score }];
    })
    .sort(
      (left, right) =>
        (right.score ?? 0) - (left.score ?? 0) ||
        (right.createdAt ?? "").localeCompare(left.createdAt ?? ""),
    )
    .slice(0, Math.min(Math.max(input.maxResults ?? 8, 1), 50));
}

/**
 * Local main-process implementation of the narrow memory backend contract.
 */
export class JsonLocalMemoryBackend implements MemoryBackend {
  private readonly file: AtomicJsonFile;
  private readonly tasks = new SerialTaskQueue();

  constructor(options: { path: string }) {
    this.file = new AtomicJsonFile(options.path);
  }

  async health(): Promise<void> {
    await this.tasks.run(async () => {
      await this.read();
    });
  }

  async createAgent(input: BackendAgentCreate): Promise<BackendAgentRecord> {
    return this.mutate((state) => {
      const record: BackendAgentRecord = {
        id: randomUUID(),
        name: input.name,
        tags: input.tags ?? [],
        metadata: input.metadata,
      };
      state.agents[record.id] = clone(record);
      return record;
    });
  }

  async listAgents(filter?: {
    name?: string;
    tags?: string[];
    matchAllTags?: boolean;
  }): Promise<BackendAgentRecord[]> {
    return this.inspect((state) =>
      Object.values(state.agents).filter(
        (agent) =>
          (!filter?.name || agent.name === filter.name) &&
          tagsMatch(agent.tags, filter?.tags, filter?.matchAllTags ?? false),
      ),
    );
  }

  async createBlock(input: BackendBlockCreate): Promise<BackendBlockRecord> {
    return this.mutate((state) => {
      const record: BackendBlockRecord = {
        id: randomUUID(),
        ...clone(input),
      };
      state.blocks[record.id] = clone(record);
      return record;
    });
  }

  async retrieveBlock(blockId: string): Promise<BackendBlockRecord> {
    return this.inspect((state) => {
      const block = state.blocks[blockId];
      if (!block) throw notFound("Block", blockId);
      return block;
    });
  }

  async updateBlock(
    blockId: string,
    input: BackendBlockUpdate,
  ): Promise<BackendBlockRecord> {
    return this.mutate((state) => {
      const block = state.blocks[blockId];
      if (!block) throw notFound("Block", blockId);
      const updated = { ...block, ...clone(input) };
      state.blocks[blockId] = updated;
      return updated;
    });
  }

  async listBlocks(filter?: {
    tags?: string[];
    matchAllTags?: boolean;
  }): Promise<BackendBlockRecord[]> {
    return this.inspect((state) =>
      Object.values(state.blocks).filter((block) =>
        tagsMatch(block.tags, filter?.tags, filter?.matchAllTags ?? false),
      ),
    );
  }

  async deleteBlock(blockId: string): Promise<void> {
    await this.mutate((state) => {
      if (!state.blocks[blockId]) throw notFound("Block", blockId);
      delete state.blocks[blockId];
    });
  }

  async createArchive(input: {
    name: string;
    description?: string;
  }): Promise<BackendArchiveRecord> {
    return this.mutate((state) => {
      const record: BackendArchiveRecord = {
        id: randomUUID(),
        ...clone(input),
      };
      state.archives[record.id] = clone(record);
      return record;
    });
  }

  async listArchives(filter?: {
    name?: string;
  }): Promise<BackendArchiveRecord[]> {
    return this.inspect((state) =>
      Object.values(state.archives).filter(
        (archive) => !filter?.name || archive.name === filter.name,
      ),
    );
  }

  async deleteArchive(archiveId: string): Promise<void> {
    await this.mutate((state) => {
      if (!state.archives[archiveId]) throw notFound("Archive", archiveId);
      delete state.archives[archiveId];
      delete state.archivePassages[archiveId];
    });
  }

  async createArchivePassage(
    archiveId: string,
    input: BackendPassageCreate,
  ): Promise<BackendPassageRecord> {
    return this.mutate((state) => {
      if (!state.archives[archiveId]) throw notFound("Archive", archiveId);
      const passage = this.createPassageRecord(input);
      state.archivePassages[archiveId] ??= {};
      state.archivePassages[archiveId][passage.id] = clone(passage);
      return passage;
    });
  }

  async listArchivePassages(
    archiveId: string,
  ): Promise<BackendPassageRecord[]> {
    return this.inspect((state) => {
      if (!state.archives[archiveId]) throw notFound("Archive", archiveId);
      return Object.values(state.archivePassages[archiveId] ?? {});
    });
  }

  async deleteArchivePassage(
    archiveId: string,
    passageId: string,
  ): Promise<void> {
    await this.mutate((state) => {
      if (!state.archivePassages[archiveId]?.[passageId]) {
        throw notFound("Passage", passageId);
      }
      delete state.archivePassages[archiveId][passageId];
    });
  }

  async searchArchivePassages(
    archiveId: string,
    input: BackendPassageSearch,
  ): Promise<BackendPassageRecord[]> {
    return this.inspect((state) => {
      if (!state.archives[archiveId]) throw notFound("Archive", archiveId);
      return searchPassages(
        Object.values(state.archivePassages[archiveId] ?? {}),
        input,
      );
    });
  }

  async createPassage(
    agentId: string,
    input: BackendPassageCreate,
  ): Promise<BackendPassageRecord> {
    return this.mutate((state) => {
      if (!state.agents[agentId]) throw notFound("Agent", agentId);
      const passage = this.createPassageRecord(input);
      state.passages[agentId] ??= {};
      state.passages[agentId][passage.id] = clone(passage);
      return passage;
    });
  }

  async listPassages(agentId: string): Promise<BackendPassageRecord[]> {
    return this.inspect((state) => {
      if (!state.agents[agentId]) throw notFound("Agent", agentId);
      return Object.values(state.passages[agentId] ?? {});
    });
  }

  async deletePassage(agentId: string, passageId: string): Promise<void> {
    await this.mutate((state) => {
      if (!state.passages[agentId]?.[passageId]) {
        throw notFound("Passage", passageId);
      }
      delete state.passages[agentId][passageId];
    });
  }

  async searchPassages(
    agentId: string,
    input: BackendPassageSearch,
  ): Promise<BackendPassageRecord[]> {
    return this.inspect((state) => {
      if (!state.agents[agentId]) throw notFound("Agent", agentId);
      return searchPassages(
        Object.values(state.passages[agentId] ?? {}),
        input,
      );
    });
  }

  private createPassageRecord(
    input: BackendPassageCreate,
  ): BackendPassageRecord {
    return {
      id: randomUUID(),
      content: input.content,
      tags: input.tags ?? [],
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
  }

  private async read(): Promise<PersistedLocalMemory> {
    const value = await this.file.read();
    return value === undefined ? emptyState() : persistedSchema.parse(value);
  }

  private inspect<T>(
    operation: (state: PersistedLocalMemory) => T,
  ): Promise<T> {
    return this.tasks.run(async () => clone(operation(await this.read())));
  }

  private mutate<T>(operation: (state: PersistedLocalMemory) => T): Promise<T> {
    return this.tasks.run(async () => {
      const state = await this.read();
      const result = operation(state);
      await this.file.write(state);
      return clone(result);
    });
  }
}
