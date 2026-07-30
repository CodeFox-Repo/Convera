import type {
  LettaApi,
  LettaAgentCreate,
  LettaAgentRecord,
  LettaArchiveRecord,
  LettaBlockCreate,
  LettaBlockRecord,
  LettaBlockUpdate,
  LettaPassageCreate,
  LettaPassageRecord,
  LettaPassageSearch,
} from "../letta-api";

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class FakeLettaApi implements LettaApi {
  readonly agents = new Map<string, LettaAgentRecord>();
  readonly blocks = new Map<string, LettaBlockRecord>();
  readonly passages = new Map<string, Map<string, LettaPassageRecord>>();
  readonly archives = new Map<
    string,
    { id: string; name: string; description?: string }
  >();
  readonly archivePassages = new Map<string, Map<string, LettaPassageRecord>>();
  readonly calls: string[] = [];
  available = true;
  failWrites = 0;
  readonly failAfterWriteMethods = new Set<string>();
  writeDelay?: () => Promise<void>;
  private blockSequence = 0;
  private passageSequence = 0;
  private agentSequence = 0;
  private archiveSequence = 0;

  async health(): Promise<void> {
    this.calls.push("health");
    if (!this.available) throw new Error("Letta is offline");
  }

  async createAgent(input: LettaAgentCreate): Promise<LettaAgentRecord> {
    await this.beforeWrite("createAgent");
    this.agentSequence += 1;
    const agent: LettaAgentRecord = {
      id: `agent-${this.agentSequence}`,
      name: input.name,
      tags: input.tags ?? [],
      metadata: input.metadata,
    };
    this.agents.set(agent.id, agent);
    return clone(agent);
  }

  async listAgents(filter?: {
    name?: string;
    tags?: string[];
    matchAllTags?: boolean;
  }): Promise<LettaAgentRecord[]> {
    this.calls.push("listAgents");
    if (!this.available) throw new Error("Letta is offline");
    return [...this.agents.values()]
      .filter((agent) => {
        if (filter?.name && agent.name !== filter.name) return false;
        if (!filter?.tags?.length) return true;
        return filter.matchAllTags
          ? filter.tags.every((tag) => agent.tags.includes(tag))
          : filter.tags.some((tag) => agent.tags.includes(tag));
      })
      .map(clone);
  }

  private async beforeWrite(name: string): Promise<void> {
    this.calls.push(name);
    if (this.writeDelay) await this.writeDelay();
    if (this.failWrites > 0) {
      this.failWrites -= 1;
      throw new Error("Injected Letta write failure");
    }
  }

  private afterWrite(name: string): void {
    if (!this.failAfterWriteMethods.delete(name)) return;
    throw new Error(`Injected response loss after ${name}`);
  }

  async createBlock(input: LettaBlockCreate): Promise<LettaBlockRecord> {
    await this.beforeWrite("createBlock");
    this.blockSequence += 1;
    const block: LettaBlockRecord = {
      id: `block-${this.blockSequence}`,
      ...clone(input),
    };
    this.blocks.set(block.id, block);
    this.afterWrite("createBlock");
    return clone(block);
  }

  async retrieveBlock(blockId: string): Promise<LettaBlockRecord> {
    this.calls.push("retrieveBlock");
    if (!this.available) throw new Error("Letta is offline");
    const block = this.blocks.get(blockId);
    if (!block)
      throw Object.assign(new Error("Block not found"), { status: 404 });
    return clone(block);
  }

  async updateBlock(
    blockId: string,
    input: LettaBlockUpdate,
  ): Promise<LettaBlockRecord> {
    await this.beforeWrite("updateBlock");
    const block = this.blocks.get(blockId);
    if (!block)
      throw Object.assign(new Error("Block not found"), { status: 404 });
    const updated = { ...block, ...clone(input) };
    this.blocks.set(blockId, updated);
    this.afterWrite("updateBlock");
    return clone(updated);
  }

  async listBlocks(filter?: {
    tags?: string[];
    matchAllTags?: boolean;
  }): Promise<LettaBlockRecord[]> {
    this.calls.push("listBlocks");
    if (!this.available) throw new Error("Letta is offline");
    return [...this.blocks.values()]
      .filter((block) => {
        if (!filter?.tags?.length) return true;
        const tags = block.tags ?? [];
        return filter.matchAllTags
          ? filter.tags.every((tag) => tags.includes(tag))
          : filter.tags.some((tag) => tags.includes(tag));
      })
      .map(clone);
  }

  async deleteBlock(blockId: string): Promise<void> {
    await this.beforeWrite("deleteBlock");
    if (!this.blocks.delete(blockId)) {
      throw Object.assign(new Error("Block not found"), { status: 404 });
    }
    this.afterWrite("deleteBlock");
  }

  async createArchive(input: {
    name: string;
    description?: string;
  }): Promise<LettaArchiveRecord> {
    await this.beforeWrite("createArchive");
    this.archiveSequence += 1;
    const archive = {
      id: `archive-${this.archiveSequence}`,
      name: input.name,
      description: input.description,
    };
    this.archives.set(archive.id, archive);
    this.afterWrite("createArchive");
    return clone(archive);
  }

  async listArchives(filter?: {
    name?: string;
  }): Promise<LettaArchiveRecord[]> {
    this.calls.push("listArchives");
    if (!this.available) throw new Error("Letta is offline");
    return [...this.archives.values()]
      .filter((archive) => !filter?.name || archive.name === filter.name)
      .map(clone);
  }

  async deleteArchive(archiveId: string): Promise<void> {
    await this.beforeWrite("deleteArchive");
    if (!this.archives.delete(archiveId)) {
      throw Object.assign(new Error("Archive not found"), { status: 404 });
    }
    this.archivePassages.delete(archiveId);
    this.afterWrite("deleteArchive");
  }

  async createArchivePassage(
    archiveId: string,
    input: LettaPassageCreate,
  ): Promise<LettaPassageRecord> {
    await this.beforeWrite("createArchivePassage");
    if (!this.archives.has(archiveId)) {
      throw Object.assign(new Error("Archive not found"), { status: 404 });
    }
    this.passageSequence += 1;
    const passage: LettaPassageRecord = {
      id: `passage-${this.passageSequence}`,
      content: input.content,
      tags: input.tags ?? [],
      createdAt: input.createdAt,
    };
    const passages =
      this.archivePassages.get(archiveId) ??
      new Map<string, LettaPassageRecord>();
    passages.set(passage.id, passage);
    this.archivePassages.set(archiveId, passages);
    this.afterWrite("createArchivePassage");
    return clone(passage);
  }

  async listArchivePassages(archiveId: string): Promise<LettaPassageRecord[]> {
    this.calls.push("listArchivePassages");
    if (!this.available) throw new Error("Letta is offline");
    return [...(this.archivePassages.get(archiveId)?.values() ?? [])].map(
      clone,
    );
  }

  async deleteArchivePassage(
    archiveId: string,
    passageId: string,
  ): Promise<void> {
    await this.beforeWrite("deleteArchivePassage");
    if (!this.archivePassages.get(archiveId)?.delete(passageId)) {
      throw Object.assign(new Error("Passage not found"), { status: 404 });
    }
    this.afterWrite("deleteArchivePassage");
  }

  async searchArchivePassages(
    archiveId: string,
    input: LettaPassageSearch,
  ): Promise<LettaPassageRecord[]> {
    this.calls.push("searchArchivePassages");
    if (!this.available) throw new Error("Letta is offline");
    return this.filterPassages(
      [...(this.archivePassages.get(archiveId)?.values() ?? [])],
      input,
    );
  }

  async createPassage(
    agentId: string,
    input: LettaPassageCreate,
  ): Promise<LettaPassageRecord> {
    await this.beforeWrite("createPassage");
    this.passageSequence += 1;
    const passage: LettaPassageRecord = {
      id: `passage-${this.passageSequence}`,
      content: input.content,
      tags: input.tags ?? [],
      createdAt: input.createdAt,
    };
    const agentPassages =
      this.passages.get(agentId) ?? new Map<string, LettaPassageRecord>();
    agentPassages.set(passage.id, passage);
    this.passages.set(agentId, agentPassages);
    return clone(passage);
  }

  async listPassages(agentId: string): Promise<LettaPassageRecord[]> {
    this.calls.push("listPassages");
    if (!this.available) throw new Error("Letta is offline");
    return [...(this.passages.get(agentId)?.values() ?? [])].map(clone);
  }

  async deletePassage(agentId: string, passageId: string): Promise<void> {
    await this.beforeWrite("deletePassage");
    if (!this.passages.get(agentId)?.delete(passageId)) {
      throw Object.assign(new Error("Passage not found"), { status: 404 });
    }
    this.afterWrite("deletePassage");
  }

  async searchPassages(
    agentId: string,
    input: LettaPassageSearch,
  ): Promise<LettaPassageRecord[]> {
    this.calls.push("searchPassages");
    if (!this.available) throw new Error("Letta is offline");
    return this.filterPassages(
      [...(this.passages.get(agentId)?.values() ?? [])],
      input,
    );
  }

  private filterPassages(
    records: LettaPassageRecord[],
    input: LettaPassageSearch,
  ): LettaPassageRecord[] {
    const terms = (input.query ?? "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    return records
      .filter((passage) => {
        const content = passage.content.toLowerCase();
        const matchesQuery = terms.every((term) => content.includes(term));
        const matchesTags =
          !input.tags?.length ||
          input.tags.every((tag) => passage.tags.includes(tag));
        return matchesQuery && matchesTags;
      })
      .map((passage) => ({
        ...clone(passage),
        score: terms.length || 1,
      }))
      .slice(0, input.maxResults);
  }
}
