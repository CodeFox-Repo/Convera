/**
 * Multi-agent workspace types, shared by the renderer and the main process.
 *
 * The model in one line: a channel holds ONE public transcript; each agent sees
 * its own PROJECTION of that transcript (see `projectFor`). Agents are durable
 * entities that appear in many channels and carry one sandbox each.
 */

/** A participant in a channel — a human or an agent. */
export interface Member {
  id: string;
  workspaceId: string;
  kind: "human" | "agent";
  name: string;
  /** Emoji or data URL. */
  avatar: string | null;
  /** Set when kind === "agent"; points at the `agents` table. */
  agentId: string | null;
  status: "idle" | "working" | "offline";
}

/**
 * Filesystem boundary for one agent.
 *
 * `root` is the cage: every path an agent touches must resolve inside it.
 * `writableRoots` is the narrower set it may modify. Keeping them separate lets
 * an agent read its own SOUL.md and skills while only writing to `workspace/`.
 */
export interface AgentSandbox {
  root: string;
  writableRoots: string[];
  networkAccess: boolean;
}

/** Standard layout under an agent's sandbox root. */
export const SANDBOX_LAYOUT = {
  soul: "SOUL.md",
  memory: "memory",
  memoryIndex: "memory/MEMORY.md",
  skills: "skills",
  workspace: "workspace",
} as const;

/**
 * The top of the sidebar hierarchy: a named home for a set of groups, the way
 * a Slack workspace or Discord server holds its channel list. One workspace
 * ("Personal") exists by default; the layer is here so several can coexist
 * without every group floating at the root.
 */
export interface Workspace {
  id: string;
  name: string;
  /** Emoji shown before the name; null renders the app logo. */
  icon: string | null;
  sortOrder: number;
}

/** Sidebar section: "The Hive" / "Product" / "Launch Swarm". */
export interface Group {
  id: string;
  workspaceId: string;
  name: string;
  /** Emoji shown before the name; null renders no icon. */
  icon: string | null;
  sortOrder: number;
}

/**
 * A place where conversation happens. Conversations stay in their own table;
 * a channel *references* one so history and search keep working unchanged.
 */
export interface Channel {
  id: string;
  workspaceId: string;
  /** null = ungrouped, listed under a default section. */
  groupId: string | null;
  name: string;
  kind: "channel" | "dm";
  isPrivate: boolean;
  /** Member ids; who can be @-mentioned here. */
  memberIds: string[];
  /** Backing conversation holding this channel's messages. */
  conversationId: string;
  /** Replies when nobody is mentioned. */
  defaultAgentMemberId: string | null;
  /** Position within its group. Absent on rows created before drag ordering. */
  sortOrder?: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A hireable agent blueprint for the talent market. Hiring instantiates an
 * Agent + Member from it; the template itself never joins a channel.
 */
export interface AgentTemplate {
  id: string;
  name: string;
  /** Emoji face for the card and avatar. */
  avatar: string;
  /** One-line role, e.g. "Code reviewer". */
  role: string;
  description: string;
  systemPrompt: string;
  /** Free-form tags for filtering the market. */
  tags: string[];
}
