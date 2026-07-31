import type { Member } from "@/shared/types/workspace";
import { describe, expect, it } from "vitest";
import {
  activeMentionQuery,
  findMentionSpans,
  membersMatching,
  parseMentions,
} from "./mention-parser";

function member(id: string, name: string, kind: Member["kind"]): Member {
  return {
    id,
    workspaceId: "w",
    kind,
    name,
    avatar: null,
    agentId: kind === "agent" ? `a-${id}` : null,
    status: "idle",
  };
}

const maya = member("m-maya", "Maya Chen", "human");
const fizz = member("m-fizz", "Fizz", "agent");
const honey = member("m-honey", "Honey", "agent");
const members = [maya, fizz, honey];

describe("parseMentions", () => {
  it("resolves a plain mention", () => {
    expect(parseMentions("hey @Fizz can you look", members)).toEqual([fizz.id]);
  });

  it("prefers the longest matching name when names contain spaces", () => {
    // "Maya" alone would be a valid shorter prefix of a member list entry.
    const withMaya = [...members, member("m-m", "Maya", "agent")];
    expect(parseMentions("ping @Maya Chen please", withMaya)).toEqual([
      maya.id,
    ]);
  });

  it("stops at punctuation right after the name", () => {
    expect(parseMentions("@Fizz, and @Honey.", members)).toEqual([
      fizz.id,
      honey.id,
    ]);
  });

  it("dedupes repeated mentions", () => {
    expect(parseMentions("@Fizz @Honey @Fizz", members)).toEqual([
      fizz.id,
      honey.id,
    ]);
  });

  it("ignores an @ that matches nobody", () => {
    expect(parseMentions("mail me at @nobody or a@b.com", members)).toEqual([]);
  });

  it("ignores mentions inside inline code", () => {
    expect(parseMentions("write `@Fizz` to page him", members)).toEqual([]);
  });

  it("ignores mentions inside fenced blocks", () => {
    const text = "before\n```\n@Fizz\n```\nafter @Honey";
    expect(parseMentions(text, members)).toEqual([honey.id]);
  });

  it("does not match a name that is only a prefix of a longer word", () => {
    expect(parseMentions("@Fizzy is not @Fizz", members)).toEqual([fizz.id]);
  });

  it("is case-insensitive", () => {
    expect(parseMentions("@fizz", members)).toEqual([fizz.id]);
  });
});

describe("findMentionSpans", () => {
  it("reports offset and length for chip rendering", () => {
    const text = "hi @Maya Chen and @Fizz";
    expect(findMentionSpans(text, members)).toEqual([
      { offset: 3, length: 10, memberId: maya.id, name: "Maya Chen" },
      { offset: 18, length: 5, memberId: fizz.id, name: "Fizz" },
    ]);
    expect(text.slice(3, 13)).toBe("@Maya Chen");
  });

  it("keeps duplicates as separate spans", () => {
    expect(findMentionSpans("@Fizz @Fizz", members)).toHaveLength(2);
  });
});

describe("activeMentionQuery", () => {
  it("opens on a bare @", () => {
    expect(activeMentionQuery("hey @", 5, members)).toEqual({
      start: 4,
      query: "",
    });
  });

  it("tracks the partial name", () => {
    expect(activeMentionQuery("hey @Fi", 7, members)).toEqual({
      start: 4,
      query: "Fi",
    });
  });

  it("keeps a space while a member name still matches", () => {
    expect(activeMentionQuery("@Maya C", 7, members)?.query).toBe("Maya C");
  });

  it("closes once the space cannot belong to any name", () => {
    expect(activeMentionQuery("@Fizz thanks", 12, members)).toBeNull();
  });

  it("does not open inside a word", () => {
    expect(activeMentionQuery("a@b", 3, members)).toBeNull();
  });
});

describe("membersMatching", () => {
  it("returns everyone for an empty query", () => {
    expect(membersMatching("", members)).toHaveLength(3);
  });

  it("filters by prefix, case-insensitively", () => {
    expect(membersMatching("ho", members)).toEqual([honey]);
  });
});
