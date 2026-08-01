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
  /**
   * What this member is, in the org's own words: `admin`, `hr`, `oncall`.
   *
   * Humans and agents carry the same tags from the same list. An agent is a
   * colleague, not a feature — it differs in how you talk to it, not in what
   * it is allowed to see, so nothing here special-cases `kind`.
   */
  tags?: string[];
}

/**
 * A role, and what holding it permits.
 *
 * Tags are free-form strings on a member; a Tag row exists for the ones the
 * workspace has named, so they can be listed, described and given powers.
 * A tag with no row still works for visibility — it simply grants nothing.
 */
export interface Tag {
  id: string;
  workspaceId: string;
  /** Lowercase, stable; what `Member.tags` and `Channel.visibleToTags` store. */
  name: string;
  description?: string;
  permissions: TagPermission[];
  /** Built-in tags cannot be deleted or renamed. */
  isBuiltIn?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Powers a tag may grant. Deliberately a closed list: a permission nobody
 * enforces is a lie, so each entry here is checked somewhere.
 */
export const TAG_PERMISSIONS = [
  /** See and search every channel, whatever its tags require. */
  "channel:view-all",
  /** Create, rename and delete channels and groups. */
  "channel:manage",
  /** Change who holds which tag, and what tags permit. */
  "tag:manage",
  /** Hire, configure and dismiss agents. */
  "agent:manage",
] as const;

export type TagPermission = (typeof TAG_PERMISSIONS)[number];

export const TAG_PERMISSION_LABELS: Record<TagPermission, string> = {
  "channel:view-all": "View every channel",
  "channel:manage": "Manage channels and groups",
  "tag:manage": "Manage tags and who holds them",
  "agent:manage": "Manage agents",
};

/** The one tag that exists in every workspace, holding every permission. */
export const ADMIN_TAG = "admin";

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
  /**
   * What this room is for, in the workspace's own words.
   *
   * Not decoration: a colleague — human or agent — reads it to know whether a
   * message belongs here, the way a new hire reads the pinned post. It travels
   * into an agent's channel context and its `list_channels` / `read_channel`
   * results, so writing one here is how you tell every agent what #announcements
   * means without touching a prompt.
   */
  description?: string;
  /**
   * Which tags may see this channel. Empty (or absent) means the whole
   * workspace can — a public room you have not joined yet is how a colleague
   * discovers where the work is happening.
   *
   * This governs *discovery*, not just entry: a channel you lack the tag for
   * does not appear in listings or search, and asking for it by id returns
   * the same error as a channel that does not exist. Holding any one of the
   * listed tags is enough.
   */
  visibleToTags?: string[];
  /**
   * Superseded by `visibleToTags`; retained so rows written before the
   * migration still read correctly if one is ever missed.
   * @deprecated
   */
  isPrivate?: boolean;
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
