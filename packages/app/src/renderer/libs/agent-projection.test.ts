import type { Member } from "@/shared/types/workspace";
import { describe, expect, it } from "vitest";
import {
  buildChannelContext,
  isPass,
  projectFor,
  projectOpenFloor,
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

  it("makes a direct reply and its quoted parent explicit to the agent", () => {
    const replied: ProjectableMessage[] = [
      ...transcript,
      {
        id: "4",
        senderId: maya.id,
        role: "user",
        content: "Can you expand that?",
        replyToMessageId: "2",
      },
    ];

    const projected = projectFor(honey.id, replied, members);
    expect(projected.at(-1)).toEqual({
      role: "user",
      content:
        'Maya Chen: [Replying to Fizz (2): "three-beat plan"]\nCan you expand that?',
    });
  });

  it("keeps reply context when the quoted parent is dropped by the budget", () => {
    const replied: ProjectableMessage[] = [
      {
        id: "parent",
        senderId: fizz.id,
        role: "assistant",
        content: `important premise ${"x".repeat(1_000)}`,
      },
      {
        id: "reply",
        senderId: maya.id,
        role: "user",
        content: "Please act on this.",
        replyToMessageId: "parent",
      },
    ];

    const projected = projectFor(honey.id, replied, members, { maxChars: 350 });
    expect(projected).toHaveLength(1);
    expect(projected[0].content).toContain("Replying to Fizz (parent)");
    expect(projected[0].content).toContain("important premise");
    expect(projected[0].content).toContain("Please act on this.");
  });

  it("marks a dangling reply without inventing its author or contents", () => {
    const projected = projectFor(
      fizz.id,
      [
        {
          id: "reply",
          senderId: maya.id,
          role: "user",
          content: "Still relevant?",
          replyToMessageId: "gone",
        },
      ],
      members,
    );

    expect(projected[0].content).toBe(
      "Maya Chen: [Replying to unavailable message (gone)]\nStill relevant?",
    );
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

describe("projectOpenFloor", () => {
  const bean: Member = {
    id: "m-bean",
    workspaceId: "w",
    kind: "agent",
    name: "Bean",
    avatar: null,
    agentId: "a-bean",
    status: "idle",
  };
  const room = [maya, fizz, honey, bean];
  const offered = [fizz.id, honey.id, bean.id];
  const question: ProjectableMessage[] = [
    { id: "1", senderId: maya.id, role: "user", content: "大家能收到消息么" },
  ];

  it("gives every offered agent a batch without its colleagues' answers", () => {
    // The parroting bug: turns commit one at a time, so agents 2 and 3 used to
    // be projected from a transcript that already held agent 1's "能收到。" and
    // simply repeated it.
    const answered: ProjectableMessage[] = [
      ...question,
      { id: "2", senderId: fizz.id, role: "assistant", content: "能收到。" },
      { id: "3", senderId: honey.id, role: "assistant", content: "能收到。" },
    ];
    const projected = projectOpenFloor(offered, question, room);

    for (const id of offered) {
      const view = projected.get(id)!;
      for (const reply of answered.filter((m) => m.role === "assistant")) {
        expect(view.some((m) => m.content.includes(reply.content))).toBe(false);
      }
      expect(view).toEqual([
        { role: "user", content: "Maya Chen: 大家能收到消息么" },
      ]);
    }
  });

  it("still mirrors each agent's own history as assistant", () => {
    const projected = projectOpenFloor([fizz.id, honey.id], transcript, room);
    expect(projected.get(fizz.id)).toEqual(
      projectFor(fizz.id, transcript, room),
    );
    expect(projected.get(honey.id)).toEqual(
      projectFor(honey.id, transcript, room),
    );
  });

  it("keys one entry per offered agent", () => {
    const projected = projectOpenFloor(offered, question, room);
    expect([...projected.keys()]).toEqual(offered);
  });

  /**
   * The fan-out as the store runs it: one turn at a time, each committing its
   * reply into the shared transcript before the next agent is invoked. Only
   * the projection source differs, and that is the whole bug — re-projecting
   * per turn feeds agent N everything agents 1..N-1 just said.
   */
  function runFanOut(
    project: (
      id: string,
      live: ProjectableMessage[],
    ) => ReturnType<typeof projectFor>,
  ) {
    const live = [...question];
    const seen = new Map<string, ReturnType<typeof projectFor>>();
    for (const id of offered) {
      seen.set(id, project(id, live));
      live.push({
        id: `r-${id}`,
        senderId: id,
        role: "assistant",
        content: "能收到。",
      });
    }
    return seen;
  }

  it("survives a serial fan-out that re-projecting per turn does not", () => {
    const contaminated = (views: Map<string, ReturnType<typeof projectFor>>) =>
      offered.filter((id) =>
        views.get(id)!.some((m) => m.content.includes("能收到。")),
      );

    // Old behaviour, kept as the contrast: agents 2 and 3 read the answers.
    expect(
      contaminated(runFanOut((id, live) => projectFor(id, live, room))),
    ).toEqual([honey.id, bean.id]);

    const frozen = projectOpenFloor(offered, question, room);
    expect(contaminated(runFanOut((id) => frozen.get(id)!))).toEqual([]);
  });
});

describe("buildChannelContext", () => {
  it("names the agent, its peers, and the prefix convention", () => {
    const context = buildChannelContext(fizz, "flight-path", members);
    expect(context).toContain('you are "Fizz"');
    expect(context).toContain("#flight-path");
    expect(context).toContain("Maya Chen (human)");
    expect(context).toContain("Honey (agent)");
    expect(context).not.toContain("Fizz (agent)"); // not listed as its own peer
    expect(context).toContain("@Name");
  });

  it("handles a channel with no other participants", () => {
    const context = buildChannelContext(fizz, "solo", [fizz]);
    expect(context).toContain("only one in this room");
    expect(context).not.toContain("@Name");
  });
});

describe("isPass", () => {
  it("recognises a declined turn and leaves real replies alone", () => {
    expect(isPass("[pass]")).toBe(true);
    expect(isPass("  [PASS]  ")).toBe(true);
    expect(isPass("[pass] Patch knows this better")).toBe(true);
    expect(isPass("Passing this to Patch")).toBe(false);
    expect(isPass("Sure, here's the fix")).toBe(false);
  });
});

describe("open-floor peer awareness", () => {
  const quill: Member = {
    id: "m-quill",
    workspaceId: "w",
    kind: "agent",
    name: "Quill",
    avatar: null,
    agentId: "a-quill",
    status: "idle",
  };
  const room = [maya, fizz, quill];

  it("names the colleagues who got the same message, with what they do", () => {
    // Without this an agent only knows IT was asked, concludes it should
    // answer, and three colleagues each post the same sentence.
    const context = buildChannelContext(fizz, "docs", room, true, [
      { id: fizz.id, name: "Fizz" },
      { id: quill.id, name: "Quill", description: "Writes the docs" },
    ]);

    expect(context).toContain("Quill (Writes the docs)");
    expect(context).not.toContain("Fizz (");
    expect(context).toContain("designated responder");
  });

  it("appoints exactly one designated responder for unaddressed chatter", () => {
    const offered = [
      { id: fizz.id, name: "Fizz" },
      { id: quill.id, name: "Quill", description: "Writes the docs" },
    ];
    // Fizz is first on the list: it is told the greeting is its to answer...
    expect(buildChannelContext(fizz, "docs", room, true, offered)).toContain(
      "YOU are the designated responder",
    );
    // ...and Quill is told to leave it to Fizz, by name.
    expect(buildChannelContext(quill, "docs", room, true, offered)).toContain(
      "Fizz is the designated responder",
    );
  });

  it("does not claim company when nobody else was offered", () => {
    const context = buildChannelContext(fizz, "docs", room, true, [
      { id: fizz.id, name: "Fizz" },
    ]);

    expect(context).not.toContain("at the same time as you");
    expect(context).toContain("yours to answer or leave");
  });
});
