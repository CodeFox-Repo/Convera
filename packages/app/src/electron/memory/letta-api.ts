import Letta from "@letta-ai/letta-client";

export interface LettaBlockRecord {
  id: string;
  label?: string | null;
  value: string;
  description?: string | null;
  limit?: number;
  metadata?: Record<string, unknown> | null;
  tags?: string[] | null;
}

export interface LettaPassageRecord {
  id: string;
  content: string;
  tags: string[];
  createdAt?: string;
  score?: number;
}

export interface LettaAgentRecord {
  id: string;
  name: string;
  tags: string[];
  metadata?: Record<string, unknown> | null;
}

export interface LettaAgentCreate {
  name: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface LettaBlockCreate {
  label: string;
  value: string;
  description?: string;
  limit?: number;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

export interface LettaBlockUpdate {
  label?: string;
  value?: string;
  description?: string;
  limit?: number;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

export interface LettaPassageCreate {
  content: string;
  tags?: string[];
  createdAt?: string;
}

export interface LettaPassageSearch {
  query?: string;
  tags?: string[];
  maxResults?: number;
  startDate?: string;
  endDate?: string;
}

/**
 * Deliberately narrow boundary around the generated Letta client.
 * Business code depends on this contract so SDK churn remains isolated.
 */
export interface LettaApi {
  health(): Promise<void>;
  createAgent(input: LettaAgentCreate): Promise<LettaAgentRecord>;
  listAgents(filter?: {
    name?: string;
    tags?: string[];
    matchAllTags?: boolean;
  }): Promise<LettaAgentRecord[]>;
  createBlock(input: LettaBlockCreate): Promise<LettaBlockRecord>;
  retrieveBlock(blockId: string): Promise<LettaBlockRecord>;
  updateBlock(
    blockId: string,
    input: LettaBlockUpdate,
  ): Promise<LettaBlockRecord>;
  listBlocks(filter?: {
    tags?: string[];
    matchAllTags?: boolean;
  }): Promise<LettaBlockRecord[]>;
  deleteBlock(blockId: string): Promise<void>;
  createArchive(input: {
    name: string;
    description?: string;
  }): Promise<{ id: string; name: string }>;
  deleteArchive(archiveId: string): Promise<void>;
  createArchivePassage(
    archiveId: string,
    input: LettaPassageCreate,
  ): Promise<LettaPassageRecord>;
  listArchivePassages(archiveId: string): Promise<LettaPassageRecord[]>;
  deleteArchivePassage(archiveId: string, passageId: string): Promise<void>;
  searchArchivePassages(
    archiveId: string,
    input: LettaPassageSearch,
  ): Promise<LettaPassageRecord[]>;
  createPassage(
    agentId: string,
    input: LettaPassageCreate,
  ): Promise<LettaPassageRecord>;
  listPassages(agentId: string): Promise<LettaPassageRecord[]>;
  deletePassage(agentId: string, passageId: string): Promise<void>;
  searchPassages(
    agentId: string,
    input: LettaPassageSearch,
  ): Promise<LettaPassageRecord[]>;
}

export interface OfficialLettaApiConfig {
  baseURL: string;
  apiKey?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetch?: typeof globalThis.fetch;
}

function mapBlock(block: {
  id: string;
  value: string;
  label?: string | null;
  description?: string | null;
  limit?: number;
  metadata?: Record<string, unknown> | null;
  tags?: string[] | null;
}): LettaBlockRecord {
  return {
    id: block.id,
    label: block.label,
    value: block.value,
    description: block.description,
    limit: block.limit,
    metadata: block.metadata,
    tags: block.tags,
  };
}

function mapAgentPassage(passage: {
  id?: string;
  text: string;
  tags?: string[] | null;
  created_at?: string | null;
}): LettaPassageRecord {
  if (!passage.id) {
    throw new Error("Letta returned an archival passage without an id.");
  }
  return {
    id: passage.id,
    content: passage.text,
    tags: passage.tags ?? [],
    createdAt: passage.created_at ?? undefined,
  };
}

function mapAgent(agent: {
  id: string;
  name: string;
  tags: string[];
  metadata?: Record<string, unknown> | null;
}): LettaAgentRecord {
  return {
    id: agent.id,
    name: agent.name,
    tags: agent.tags,
    metadata: agent.metadata,
  };
}

export class OfficialLettaApiAdapter implements LettaApi {
  private readonly client: Letta;

  constructor(config: OfficialLettaApiConfig) {
    this.client = new Letta({
      baseURL: config.baseURL,
      apiKey: config.apiKey,
      timeout: config.timeoutMs,
      maxRetries: config.maxRetries ?? 2,
      fetch: config.fetch,
    });
  }

  async health(): Promise<void> {
    await this.client.health();
  }

  async createAgent(input: LettaAgentCreate): Promise<LettaAgentRecord> {
    return mapAgent(
      await this.client.agents.create({
        name: input.name,
        description: input.description,
        tags: input.tags,
        metadata: input.metadata,
        include_base_tools: false,
        message_buffer_autoclear: true,
      }),
    );
  }

  async listAgents(filter?: {
    name?: string;
    tags?: string[];
    matchAllTags?: boolean;
  }): Promise<LettaAgentRecord[]> {
    const page = await this.client.agents.list({
      name: filter?.name,
      tags: filter?.tags,
      match_all_tags: filter?.matchAllTags,
    });
    const agents: LettaAgentRecord[] = [];
    for await (const agent of page) agents.push(mapAgent(agent));
    return agents;
  }

  async createBlock(input: LettaBlockCreate): Promise<LettaBlockRecord> {
    return mapBlock(
      await this.client.blocks.create({
        label: input.label,
        value: input.value,
        description: input.description,
        limit: input.limit,
        metadata: input.metadata,
        tags: input.tags,
      }),
    );
  }

  async retrieveBlock(blockId: string): Promise<LettaBlockRecord> {
    return mapBlock(await this.client.blocks.retrieve(blockId));
  }

  async updateBlock(
    blockId: string,
    input: LettaBlockUpdate,
  ): Promise<LettaBlockRecord> {
    return mapBlock(
      await this.client.blocks.update(blockId, {
        label: input.label,
        value: input.value,
        description: input.description,
        limit: input.limit,
        metadata: input.metadata,
        tags: input.tags,
      }),
    );
  }

  async listBlocks(filter?: {
    tags?: string[];
    matchAllTags?: boolean;
  }): Promise<LettaBlockRecord[]> {
    const page = await this.client.blocks.list({
      tags: filter?.tags,
      match_all_tags: filter?.matchAllTags,
    });
    const blocks: LettaBlockRecord[] = [];
    for await (const block of page) {
      blocks.push(mapBlock(block));
    }
    return blocks;
  }

  async deleteBlock(blockId: string): Promise<void> {
    await this.client.blocks.delete(blockId);
  }

  async createArchive(input: {
    name: string;
    description?: string;
  }): Promise<{ id: string; name: string }> {
    const archive = await this.client.archives.create(input);
    return { id: archive.id, name: archive.name };
  }

  async deleteArchive(archiveId: string): Promise<void> {
    await this.client.archives.delete(archiveId);
  }

  async createArchivePassage(
    archiveId: string,
    input: LettaPassageCreate,
  ): Promise<LettaPassageRecord> {
    const passage = await this.client.archives.passages.create(archiveId, {
      text: input.content,
      tags: input.tags,
      created_at: input.createdAt,
    });
    return mapAgentPassage(passage);
  }

  async listArchivePassages(archiveId: string): Promise<LettaPassageRecord[]> {
    return this.searchArchivePassages(archiveId, { maxResults: 100 });
  }

  async deleteArchivePassage(
    archiveId: string,
    passageId: string,
  ): Promise<void> {
    await this.client.archives.passages.delete(passageId, {
      archive_id: archiveId,
    });
  }

  async searchArchivePassages(
    archiveId: string,
    input: LettaPassageSearch,
  ): Promise<LettaPassageRecord[]> {
    const response = await this.client.passages.search({
      archive_id: archiveId,
      query: input.query,
      tags: input.tags,
      limit: input.maxResults,
      start_date: input.startDate,
      end_date: input.endDate,
    });
    return response.map((result) => ({
      ...mapAgentPassage(result.passage),
      score: result.score,
    }));
  }

  async createPassage(
    agentId: string,
    input: LettaPassageCreate,
  ): Promise<LettaPassageRecord> {
    const passages = await this.client.agents.passages.create(agentId, {
      text: input.content,
      tags: input.tags,
      created_at: input.createdAt,
    });
    const passage = passages[0];
    if (!passage) {
      throw new Error("Letta did not return the created archival passage.");
    }
    return mapAgentPassage(passage);
  }

  async listPassages(agentId: string): Promise<LettaPassageRecord[]> {
    const passages = await this.client.agents.passages.list(agentId);
    return passages.map(mapAgentPassage);
  }

  async deletePassage(agentId: string, passageId: string): Promise<void> {
    await this.client.agents.passages.delete(passageId, {
      agent_id: agentId,
    });
  }

  async searchPassages(
    agentId: string,
    input: LettaPassageSearch,
  ): Promise<LettaPassageRecord[]> {
    const response = await this.client.agents.passages.search(agentId, {
      query: input.query ?? "",
      tags: input.tags,
      top_k: input.maxResults,
      start_datetime: input.startDate,
      end_datetime: input.endDate,
    });
    return response.results.map((result) => ({
      id: result.id,
      content: result.content,
      tags: result.tags ?? [],
      createdAt: result.timestamp,
    }));
  }
}
