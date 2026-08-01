/**
 * A custom agent's identity lives in two rows: the Agent holds its behaviour,
 * the Member holds the face and the name every surface renders. These are the
 * two places they can fall out of step.
 */

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db, LOCAL_HUMAN_MEMBER_ID, memberIdForAgent } from "../db";
import { createAgent, updateAgent } from "../db/hooks";
import { describeAgentRemoval } from "../agent-templates";
import { ensureAgentDM } from "../agent-dm";
import { createChannel } from "../stores/channel-store";
import { getMember, updateMemberProfile } from "../stores/member-store";

const NEW_AGENT = {
  name: "Rosa",
  description: "Writes the migration nobody wants to write.",
  systemPrompt: "You are Rosa.",
  disableToolReferences: [],
  selectedMCPs: [],
};

describe("custom agent identity", () => {
  beforeEach(async () => {
    await db.open();
    await db.agents.clear();
    await db.members.clear();
    await db.channels.clear();
  });

  it("gives a new agent a member row to hang an avatar on", async () => {
    const id = await createAgent(NEW_AGENT);
    const memberId = memberIdForAgent(id);

    expect((await getMember(memberId))?.name).toBe("Rosa");

    await updateMemberProfile(memberId, { avatar: "🧱" });
    expect((await getMember(memberId))?.avatar).toBe("🧱");
  });

  it("carries a rename onto the member row", async () => {
    const id = await createAgent(NEW_AGENT);
    const memberId = memberIdForAgent(id);
    await updateMemberProfile(memberId, { avatar: "🧱" });

    await updateAgent(id, { name: "Rosalind" });

    const member = await getMember(memberId);
    expect(member?.name).toBe("Rosalind");
    // A rename is not a new hire: the portrait survives it.
    expect(member?.avatar).toBe("🧱");
  });

  it("recreates a member row that went missing, rather than losing the name", async () => {
    const id = await createAgent(NEW_AGENT);
    await db.members.delete(memberIdForAgent(id));

    await updateAgent(id, { name: "Rosalind" });

    expect((await getMember(memberIdForAgent(id)))?.name).toBe("Rosalind");
  });

  it("renames the DM room, which the header reads instead of the member", async () => {
    const id = await createAgent(NEW_AGENT);
    const { channelId } = await ensureAgentDM(id);

    await updateAgent(id, { name: "Rosalind" });

    expect((await db.channels.get(channelId))?.name).toBe("Rosalind");
  });

  it("leaves a shared channel's own name alone", async () => {
    const id = await createAgent(NEW_AGENT);
    const memberId = memberIdForAgent(id);
    const channelId = await createChannel({
      name: "💬 general",
      groupId: null,
      memberIds: [LOCAL_HUMAN_MEMBER_ID, memberId],
    });
    await db.channels.update(channelId, { defaultAgentMemberId: memberId });

    await updateAgent(id, { name: "Rosalind" });

    expect((await db.channels.get(channelId))?.name).toBe("💬 general");
  });
});

describe("describeAgentRemoval", () => {
  const room = (
    name: string,
    kind: "channel" | "dm",
    memberIds: string[],
    defaultAgentMemberId: string | null = null,
  ) => ({ name, kind, memberIds, defaultAgentMemberId });

  it("names the channels, the default-responder duty and the DM", () => {
    const copy = describeAgentRemoval("Elena", "agent:1", [
      room("general", "channel", ["me", "agent:1"]),
      room("code-review", "channel", ["me", "agent:1"], "agent:1"),
      room("docs", "channel", ["me", "agent:2"]),
      room("Elena", "dm", ["me", "agent:1"]),
    ]);

    expect(copy).toContain("Elena is in 2 channels");
    expect(copy).toContain("default responder in code-review");
    expect(copy).toContain("direct message history");
  });

  it("says nothing extra about someone who is nowhere yet", () => {
    const copy = describeAgentRemoval("Rosa", "agent:9", [
      room("general", "channel", ["me", "agent:1"]),
    ]);

    expect(copy).not.toContain("channel");
    expect(copy).toContain("Rosa is deleted from this workspace");
  });

  it("counts one channel in the singular and skips an absent duty", () => {
    const copy = describeAgentRemoval("Mika", "agent:2", [
      room("debugging", "channel", ["me", "agent:2"]),
    ]);

    expect(copy).toContain("Mika is in 1 channel.");
    expect(copy).not.toContain("default responder");
    expect(copy).not.toContain("direct message");
  });
});
