export interface BackendBlockRecord {
  id: string;
  label?: string | null;
  value: string;
  description?: string | null;
  limit?: number;
  metadata?: Record<string, unknown> | null;
  tags?: string[] | null;
}

export interface BackendPassageRecord {
  id: string;
  content: string;
  tags: string[];
  createdAt?: string;
  score?: number;
}

export interface BackendAgentRecord {
  id: string;
  name: string;
  tags: string[];
  metadata?: Record<string, unknown> | null;
}

export interface BackendArchiveRecord {
  id: string;
  name: string;
  description?: string | null;
}

export interface BackendAgentCreate {
  name: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface BackendBlockCreate {
  label: string;
  value: string;
  description?: string;
  limit?: number;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

export interface BackendBlockUpdate {
  label?: string;
  value?: string;
  description?: string;
  limit?: number;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

export interface BackendPassageCreate {
  content: string;
  tags?: string[];
  createdAt?: string;
}

export interface BackendPassageSearch {
  query?: string;
  tags?: string[];
  maxResults?: number;
  startDate?: string;
  endDate?: string;
}

export interface MemoryBackend {
  health(): Promise<void>;
  createAgent(input: BackendAgentCreate): Promise<BackendAgentRecord>;
  listAgents(filter?: {
    name?: string;
    tags?: string[];
    matchAllTags?: boolean;
  }): Promise<BackendAgentRecord[]>;
  createBlock(input: BackendBlockCreate): Promise<BackendBlockRecord>;
  retrieveBlock(blockId: string): Promise<BackendBlockRecord>;
  updateBlock(
    blockId: string,
    input: BackendBlockUpdate,
  ): Promise<BackendBlockRecord>;
  listBlocks(filter?: {
    tags?: string[];
    matchAllTags?: boolean;
  }): Promise<BackendBlockRecord[]>;
  deleteBlock(blockId: string): Promise<void>;
  createArchive(input: {
    name: string;
    description?: string;
  }): Promise<BackendArchiveRecord>;
  listArchives(filter?: { name?: string }): Promise<BackendArchiveRecord[]>;
  deleteArchive(archiveId: string): Promise<void>;
  createArchivePassage(
    archiveId: string,
    input: BackendPassageCreate,
  ): Promise<BackendPassageRecord>;
  listArchivePassages(archiveId: string): Promise<BackendPassageRecord[]>;
  deleteArchivePassage(archiveId: string, passageId: string): Promise<void>;
  searchArchivePassages(
    archiveId: string,
    input: BackendPassageSearch,
  ): Promise<BackendPassageRecord[]>;
  createPassage(
    agentId: string,
    input: BackendPassageCreate,
  ): Promise<BackendPassageRecord>;
  listPassages(agentId: string): Promise<BackendPassageRecord[]>;
  deletePassage(agentId: string, passageId: string): Promise<void>;
  searchPassages(
    agentId: string,
    input: BackendPassageSearch,
  ): Promise<BackendPassageRecord[]>;
}
