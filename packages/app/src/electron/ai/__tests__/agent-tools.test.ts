import type { ToolDefinition } from "@/shared/types/mcp";
import { describe, expect, it, vi } from "vitest";
import { createAgentToolCatalog } from "../agent-tools";

function definition(
  name: string,
  overrides: Partial<ToolDefinition> = {},
): ToolDefinition {
  return {
    name,
    description: `Run ${name}`,
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", minLength: 1 },
        count: { type: "integer", minimum: 1 },
      },
      required: ["path"],
    },
    ...overrides,
  };
}

describe("createAgentToolCatalog", () => {
  it("creates stable namespaced tools and validates their JSON schema", async () => {
    const executeTool = vi.fn(async () => ({ ok: true }));
    const tools = createAgentToolCatalog({
      groups: [{ serverName: "Repo Tools", tools: [definition("read/file")] }],
      executeTool,
      requestInteraction: vi.fn(async () => ({ approved: true })),
    });

    expect(tools[0]).toMatchObject({
      name: "repo_tools__read_file",
      qualifiedName: "Repo Tools:read/file",
    });
    await expect(tools[0].execute({ path: "" })).rejects.toThrow();
    await tools[0].execute({ path: "README.md", count: 2 });
    expect(executeTool).toHaveBeenCalledWith("Repo Tools", "read/file", {
      path: "README.md",
      count: 2,
    });
  });

  it("requires approval for untrusted MCP tools and open-world builtins", async () => {
    const requestInteraction = vi
      .fn()
      .mockResolvedValueOnce({ approved: false })
      .mockResolvedValueOnce({ approved: true });
    const executeTool = vi.fn(async () => "done");
    const tools = createAgentToolCatalog({
      groups: [
        {
          serverName: "external",
          tools: [
            definition("read", {
              annotations: {
                readOnlyHint: true,
                destructiveHint: false,
                openWorldHint: false,
              },
            }),
          ],
        },
        {
          serverName: "builtin",
          tools: [
            definition("web_fetch", {
              annotations: {
                readOnlyHint: true,
                destructiveHint: false,
                openWorldHint: true,
              },
            }),
          ],
        },
      ],
      executeTool,
      requestInteraction,
    });

    await expect(tools[0].execute({ path: "x" })).rejects.toThrow(
      "User denied external:read",
    );
    await expect(tools[1].execute({ path: "x" })).resolves.toBe("done");
    expect(requestInteraction).toHaveBeenCalledTimes(2);
  });

  it("routes ask_user_input through the renderer interaction channel", async () => {
    const executeTool = vi.fn();
    const tools = createAgentToolCatalog({
      groups: [
        {
          serverName: "builtin",
          tools: [
            {
              name: "ask_user_input",
              description: "Ask the user",
              inputSchema: {
                type: "object",
                properties: {
                  question: { type: "string" },
                  options: { type: "array", items: { type: "string" } },
                },
                required: ["question", "options"],
              },
            },
          ],
        },
      ],
      executeTool,
      requestInteraction: vi.fn(async () => ({ value: "Proceed" })),
    });

    await expect(
      tools[0].execute({
        question: "Continue?",
        options: ["Proceed", "Stop"],
      }),
    ).resolves.toMatchObject({ userSelection: "Proceed" });
    expect(executeTool).not.toHaveBeenCalled();
  });
});
