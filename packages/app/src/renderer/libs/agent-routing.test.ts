import type { Member } from "@/shared/types/workspace";
import { describe, expect, it } from "vitest";
import { routeMessage, type ChainState } from "./agent-routing";

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
const bean = member("m-bean", "Bean", "agent");
const members = [maya, fizz, honey, bean];

function fromHuman(content: string, defaultAgentMemberId?: string | null) {
  return routeMessage({
    message: { senderId: maya.id, content },
    members,
    defaultAgentMemberId,
  });
}

function fromAgent(senderId: string, content: string, chain: ChainState) {
  return routeMessage({
    message: { senderId, content },
    members,
    chain,
  });
}

describe("routeMessage", () => {
  it("invokes a single mentioned agent", () => {
    expect(fromHuman("@Fizz thoughts?").invoke).toEqual([fizz.id]);
  });

  it("invokes multiple mentions in order", () => {
    expect(fromHuman("@Honey then @Fizz").invoke).toEqual([honey.id, fizz.id]);
  });

  it("falls back to the channel default when nobody is mentioned", () => {
    expect(fromHuman("anyone around?", fizz.id).invoke).toEqual([fizz.id]);
  });

  it("invokes nobody when there is no mention and no default", () => {
    expect(fromHuman("anyone around?").invoke).toEqual([]);
  });

  it("ignores a mention of a human", () => {
    expect(fromHuman("@Maya Chen hi", null).invoke).toEqual([]);
  });

  it("blocks A -> B -> A", () => {
    const first = fromHuman("@Fizz kick this off");
    expect(first.invoke).toEqual([fizz.id]);

    const second = fromAgent(fizz.id, "@Honey over to you", first.chain);
    expect(second.invoke).toEqual([honey.id]);

    const third = fromAgent(honey.id, "@Fizz back to you", second.chain);
    expect(third.invoke).toEqual([]);
    expect(third.limitReached).toBe(true);
  });

  it("caps the chain at 3 hops even with fresh agents", () => {
    const h0 = fromHuman("@Fizz start");
    const h1 = fromAgent(fizz.id, "@Honey next", h0.chain);
    const h2 = fromAgent(honey.id, "@Bean next", h1.chain);
    expect(h2.invoke).toEqual([bean.id]);
    expect(h2.chain.hops).toBe(2);

    const h3 = fromAgent(bean.id, "@Fizz again", h2.chain);
    expect(h3.chain.hops).toBe(3);
    expect(h3.invoke).toEqual([]);
    expect(h3.limitReached).toBe(true);
  });

  it("counts tool-originated agent messages against the cap", () => {
    // send_message posts without mentioning anyone; the channel default would
    // otherwise re-trigger forever.
    let chain = fromHuman("@Fizz go").chain;
    for (const sender of [fizz.id, honey.id]) {
      chain = routeMessage({
        message: { senderId: sender, content: "posting an update" },
        members,
        defaultAgentMemberId: honey.id,
        chain,
      }).chain;
    }
    expect(chain.hops).toBe(2);

    const capped = routeMessage({
      message: { senderId: bean.id, content: "posting an update" },
      members,
      defaultAgentMemberId: bean.id,
      chain,
    });
    expect(capped.invoke).toEqual([]);
    expect(capped.limitReached).toBe(true);
  });

  it("starts a new chain on the next human message", () => {
    const h0 = fromHuman("@Fizz start");
    const h1 = fromAgent(fizz.id, "@Honey next", h0.chain);

    const fresh = routeMessage({
      message: { senderId: maya.id, content: "@Fizz again" },
      members,
      chain: h1.chain,
    });
    expect(fresh.invoke).toEqual([fizz.id]);
    expect(fresh.chain.hops).toBe(0);
  });

  it("does not let an agent invoke itself", () => {
    const h0 = fromHuman("@Fizz start");
    expect(
      fromAgent(fizz.id, "@Fizz talking to myself", h0.chain).invoke,
    ).toEqual([]);
  });
});
