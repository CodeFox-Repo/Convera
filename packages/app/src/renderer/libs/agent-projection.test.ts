import type { Member } from "@/shared/types/workspace";
import { describe, expect, it } from "vitest";
import {
  buildChannelContext,
  projectFor,
  type ProjectableMessage,
} from "./agent-projection";

const maya: Member = {
  id: "m-maya",
  workspaceId: "w",
  kind: "human",
  name: "Maya Chen",
  avatar: null,
  agentId: null,
  status: "idle",
};
const fizz: Member = {
  id: "m-fizz",
  workspaceId: "w",
  kind: "agent",
  name: "Fizz",
  avatar: null,
  agentId: "a-fizz",
  status: "idle",
};
const honey: Member = {
  id: "m-honey",
  workspaceId: "w",
  kind: "agent",
  name: "Honey",
  avatar: null,
  agentId: "a-honey",
  status: "idle",
};
const members = [maya, fizz, honey];

const transcript: ProjectableMessage[] = [
  { id: "1", senderId: maya.id, role: "user", content: "handoff feels fast" },
  { id: "2", senderId: fizz.id, role: "assistant", content: "three-beat plan" },
  { id: "3", senderId: honey.id, role: "assistant", content: "I'll finish it" },
];

describe("projectFor", () => {
  it("makes the target's own messages assistant and everyone else's user", () => {
    expect(projectFor(fizz.id, transcript, members)).toEqual([
      { role: "user", content: "Maya Chen: handoff feels fast" },
      { role: "assistant", content: "three-beat plan" },
      { role: "user", content: "Honey: I'll finish it" },
    ]);
  });

  it("gives a different agent the mirrored view of the same transcript", () => {
    expect(projectFor(honey.id, transcript, members)).toEqual([
      { role: "user", content: "Maya Chen: handoff feels fast" },
      { role: "user", content: "Fizz: three-beat plan" },
      { role: "assistant", content: "I'll finish it" },
    ]);
  });

  it("never labels an agent's own words as user", () => {
    // The regression that matters: self-as-user makes the model continue
    // what it thinks is someone else's turn.
    for (const target of [fizz, honey]) {
      const projected = projectFor(target.id, transcript, members);
      const own = transcript.find((m) => m.senderId === target.id)!;
      const match = projected.find((m) => m.content === own.content);
      expect(match?.role).toBe("assistant");
    }
  });

  it("does not prefix the target's own messages", () => {
    const projected = projectFor(fizz.id, transcript, members);
    expect(projected[1].content).toBe("three-beat plan");
    expect(projected[1].content).not.toContain("Fizz:");
  });

  it("emits only roles the IPC validator accepts", () => {
    const withTool: ProjectableMessage[] = [
      ...transcript,
      { id: "4", senderId: fizz.id, role: "tool", content: "tool noise" },
      { id: "5", role: "system", content: "be brief" },
    ];
    const roles = new Set(
      projectFor(fizz.id, withTool, members).map((m) => m.role),
    );
    expect(
      [...roles].every((r) => ["system", "user", "assistant"].includes(r)),
    ).toBe(true);
    expect(roles.has("system")).toBe(true);
  });

  it("drops tool messages entirely", () => {
    const withTool: ProjectableMessage[] = [
      ...transcript,
      { id: "4", senderId: fizz.id, role: "tool", content: "tool noise" },
    ];
    expect(
      projectFor(fizz.id, withTool, members).some((m) =>
        m.content.includes("tool noise"),
      ),
    ).toBe(false);
  });

  it("falls back to role when legacy messages have no senderId", () => {
    const legacy: ProjectableMessage[] = [
      { id: "1", role: "user", content: "hi" },
      { id: "2", role: "assistant", content: "hello" },
    ];
    expect(projectFor(fizz.id, legacy, members)).toEqual([
      { role: "user", content: "User: hi" },
      { role: "assistant", content: "hello" },
    ]);
  });

  it("truncates oldest first but keeps system messages", () => {
    const long: ProjectableMessage[] = [
      { id: "s", role: "system", content: "SYSTEM" },
      { id: "1", senderId: maya.id, role: "user", content: "a".repeat(100) },
      {
        id: "2",
        senderId: fizz.id,
        role: "assistant",
        content: "b".repeat(100),
      },
      { id: "3", senderId: maya.id, role: "user", content: "c".repeat(100) },
    ];
    const projected = projectFor(fizz.id, long, members, { maxChars: 150 });

    expect(projected[0]).toEqual({ role: "system", content: "SYSTEM" });
    // Newest survives, oldest is gone.
    expect(projected.at(-1)!.content).toContain("c".repeat(10));
    expect(projected.some((m) => m.content.includes("a".repeat(10)))).toBe(
      false,
    );
  });
});

describe("buildChannelContext", () => {
  it("names the agent, its peers, and the prefix convention", () => {
    const context = buildChannelContext(fizz, "flight-path", members);
    expect(context).toContain('You are "Fizz"');
    expect(context).toContain("#flight-path");
    expect(context).toContain("Maya Chen (human)");
    expect(context).toContain("Honey (agent)");
    expect(context).not.toContain("Fizz (agent)"); // not listed as its own peer
    expect(context).toContain("@Name");
  });

  it("handles a channel with no other participants", () => {
    const context = buildChannelContext(fizz, "solo", [fizz]);
    expect(context).toContain("only participant");
    expect(context).not.toContain("@Name");
  });
});
