import { describe, expect, it, vi } from "vitest";
import { OfficialLettaApiAdapter } from "./letta-api";

interface CapturedRequest {
  method: string;
  url: URL;
  headers: Headers;
  body?: unknown;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requestBody(init?: RequestInit): unknown {
  if (typeof init?.body !== "string" || init.body.length === 0) {
    return undefined;
  }
  return JSON.parse(init.body) as unknown;
}

describe("OfficialLettaApiAdapter", () => {
  it("keeps the generated client behind the narrow Node fetch contract", async () => {
    const requests: CapturedRequest[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const url = new URL(
        typeof input === "string" || input instanceof URL ? input : input.url,
      );
      const method = init?.method ?? "GET";
      requests.push({
        method,
        url,
        headers: new Headers(init?.headers),
        body: requestBody(init),
      });

      if (url.pathname === "/v1/health/") {
        return json({ status: "ok" });
      }
      if (url.pathname === "/v1/blocks/" && method === "POST") {
        return json({
          id: "block-1",
          label: "current_goal",
          value: "ship memory",
          tags: ["convera"],
        });
      }
      if (url.pathname === "/v1/blocks/block-1" && method === "GET") {
        return json({
          id: "block-1",
          label: "current_goal",
          value: "ship memory",
        });
      }
      if (url.pathname === "/v1/blocks/block-1" && method === "PATCH") {
        return json({
          id: "block-1",
          label: "current_goal",
          value: "ship durable memory",
        });
      }
      if (url.pathname === "/v1/blocks/block-1" && method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      if (url.pathname === "/v1/archives/" && method === "POST") {
        return json({ id: "archive-1", name: "convera-memory" });
      }
      if (
        url.pathname === "/v1/archives/archive-1/passages" &&
        method === "POST"
      ) {
        return json({
          id: "passage-1",
          text: "The user chose native sessions.",
          tags: ["decision"],
          created_at: "2026-07-31T00:00:00.000Z",
        });
      }
      if (url.pathname === "/v1/passages/search" && method === "POST") {
        return json([
          {
            passage: {
              id: "passage-1",
              text: "The user chose native sessions.",
              tags: ["decision"],
              created_at: "2026-07-31T00:00:00.000Z",
            },
            score: 0.91,
          },
        ]);
      }
      if (
        url.pathname === "/v1/archives/archive-1/passages/passage-1" &&
        method === "DELETE"
      ) {
        return new Response(null, { status: 204 });
      }
      if (url.pathname === "/v1/archives/archive-1" && method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      return json({ error: `Unhandled ${method} ${url.pathname}` }, 500);
    });
    const api = new OfficialLettaApiAdapter({
      baseURL: "http://127.0.0.1:8283",
      apiKey: "secret",
      maxRetries: 0,
      fetch,
    });

    await api.health();
    await api.createBlock({
      label: "current_goal",
      value: "ship memory",
      tags: ["convera"],
    });
    await api.retrieveBlock("block-1");
    await api.updateBlock("block-1", {
      value: "ship durable memory",
    });
    await api.deleteBlock("block-1");
    const archive = await api.createArchive({ name: "convera-memory" });
    await api.createArchivePassage(archive.id, {
      content: "The user chose native sessions.",
      tags: ["decision"],
      createdAt: "2026-07-31T00:00:00.000Z",
    });
    const hits = await api.searchArchivePassages(archive.id, {
      query: "native sessions",
      tags: ["decision"],
      maxResults: 3,
    });
    await api.deleteArchivePassage(archive.id, "passage-1");
    await api.deleteArchive(archive.id);

    expect(hits).toEqual([
      expect.objectContaining({ id: "passage-1", score: 0.91 }),
    ]);
    expect(
      requests.map(({ method, url }) => `${method} ${url.pathname}`),
    ).toEqual([
      "GET /v1/health/",
      "POST /v1/blocks/",
      "GET /v1/blocks/block-1",
      "PATCH /v1/blocks/block-1",
      "DELETE /v1/blocks/block-1",
      "POST /v1/archives/",
      "POST /v1/archives/archive-1/passages",
      "POST /v1/passages/search",
      "DELETE /v1/archives/archive-1/passages/passage-1",
      "DELETE /v1/archives/archive-1",
    ]);
    expect(
      requests.every(
        (request) => request.headers.get("authorization") === "Bearer secret",
      ),
    ).toBe(true);
    expect(requests[1]?.body).toMatchObject({
      label: "current_goal",
      value: "ship memory",
    });
    expect(requests[6]?.body).toMatchObject({
      text: "The user chose native sessions.",
      tags: ["decision"],
    });
    expect(requests[7]?.body).toMatchObject({
      archive_id: "archive-1",
      query: "native sessions",
      limit: 3,
    });
  });
});
