import { mkdtemp, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createBasicAgentTools } from "./basic-tools";

let sandbox: { root: string; writableRoots: string[]; networkAccess: boolean };
let tools: ReturnType<typeof createBasicAgentTools>;
const toolNamed = (name: string) => tools.find((tool) => tool.name === name)!;

beforeAll(async () => {
  const root = await mkdtemp(join(tmpdir(), "convera-basic-tools-"));
  const workspace = join(root, "workspace");
  await mkdir(workspace, { recursive: true });
  sandbox = { root, writableRoots: [workspace], networkAccess: false };
  tools = createBasicAgentTools(sandbox);
});

describe("createBasicAgentTools", () => {
  it("round-trips a file inside the writable root and lists it", async () => {
    await toolNamed("write_file").execute({
      path: "workspace/memory/notes.md",
      content: "remembered",
    });
    await expect(
      readFile(join(sandbox.writableRoots[0], "memory/notes.md"), "utf8"),
    ).resolves.toBe("remembered");
    await expect(
      toolNamed("read_file").execute({ path: "workspace/memory/notes.md" }),
    ).resolves.toBe("remembered");
    await expect(
      toolNamed("list_dir").execute({ path: "workspace/memory" }),
    ).resolves.toEqual(["notes.md"]);
  });

  it("refuses to escape the sandbox and to write outside the writable root", async () => {
    await expect(
      toolNamed("read_file").execute({ path: "../../etc/hosts" }),
    ).rejects.toThrow(/outside the agent sandbox/);
    // Inside the sandbox root, but not in a writable root.
    await expect(
      toolNamed("write_file").execute({ path: "escaped.txt", content: "x" }),
    ).rejects.toThrow(/not writable/);
  });
});
