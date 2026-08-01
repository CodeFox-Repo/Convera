import { mkdtemp, readFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBasicAgentTools } from "./basic-tools";

let sandbox: { root: string; writableRoots: string[]; networkAccess: boolean };
let tools: ReturnType<typeof createBasicAgentTools>;
const toolNamed = (name: string) => tools.find((tool) => tool.name === name)!;

beforeAll(async () => {
  // Deliberately NOT under os.tmpdir(): the seatbelt profile allows tmp, so a
  // sandbox root inside it would make the write-blocking test vacuous. The
  // production root lives under userData, which tmp never contains.
  const scratch = join(process.cwd(), ".vitest-sandbox");
  await mkdir(scratch, { recursive: true });
  const root = await mkdtemp(join(scratch, "convera-basic-tools-"));
  const workspace = join(root, "workspace");
  await mkdir(workspace, { recursive: true });
  sandbox = { root, writableRoots: [workspace], networkAccess: false };
  tools = createBasicAgentTools(sandbox);
});

afterAll(async () => {
  await rm(join(process.cwd(), ".vitest-sandbox"), {
    recursive: true,
    force: true,
  });
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
    ).resolves.toContain("notes.md");
  });

  it("refuses to escape the sandbox and to write outside the writable root", async () => {
    await expect(
      toolNamed("read_file").execute({ path: "../../etc/hosts" }),
    ).rejects.toThrow(/outside the agent sandbox/);
    // Absolute paths must not bypass the boundary either — pi's own cwd
    // handling would happily read them.
    await expect(
      toolNamed("read_file").execute({ path: "/etc/hosts" }),
    ).rejects.toThrow(/outside the agent sandbox/);
    // Inside the sandbox root, but not in a writable root.
    await expect(
      toolNamed("write_file").execute({ path: "escaped.txt", content: "x" }),
    ).rejects.toThrow(/not writable/);
  });

  it("greps and edits through the sandboxed pi tools", async () => {
    await toolNamed("write_file").execute({
      path: "workspace/src/app.ts",
      content: "const answer = 41;\n",
    });
    await expect(
      toolNamed("grep").execute({ pattern: "answer", path: "workspace/src" }),
    ).resolves.toContain("app.ts");
    await toolNamed("edit_file").execute({
      path: "workspace/src/app.ts",
      edits: [{ oldText: "41", newText: "42" }],
    });
    await expect(
      toolNamed("read_file").execute({ path: "workspace/src/app.ts" }),
    ).resolves.toContain("42");
    await expect(
      toolNamed("edit_file").execute({
        path: "unwritable.ts",
        edits: [{ oldText: "a", newText: "b" }],
      }),
    ).rejects.toThrow(/not writable/);
  });

  describe("run_command", () => {
    it("runs in the workspace and its writes land there", async () => {
      const result = (await toolNamed("run_command").execute({
        command: "pwd && echo made > made.txt",
      })) as { success: boolean; stdout: string };
      expect(result.success).toBe(true);
      await expect(
        readFile(join(sandbox.writableRoots[0], "made.txt"), "utf8"),
      ).resolves.toBe("made\n");
    });

    it("reports failure with stderr and exit code instead of throwing", async () => {
      const result = (await toolNamed("run_command").execute({
        command: "exit 3",
      })) as { success: boolean; exitCode: number };
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(3);
    });

    // The OS boundary only exists on macOS today; cwd is best-effort elsewhere.
    it.runIf(process.platform === "darwin")(
      "blocks shell writes outside the writable roots",
      async () => {
        const outside = join(sandbox.root, "smuggled.txt");
        const result = (await toolNamed("run_command").execute({
          command: `echo x > ${JSON.stringify(outside)}`,
        })) as { success: boolean };
        expect(result.success).toBe(false);
        await expect(readFile(outside, "utf8")).rejects.toThrow();
      },
    );

    it.runIf(process.platform === "darwin")(
      "denies the network when the sandbox says so",
      async () => {
        const result = (await toolNamed("run_command").execute({
          command:
            "curl -s --max-time 3 https://example.com >/dev/null && echo reached || echo blocked",
        })) as { stdout: string };
        expect(result.stdout).toContain("blocked");
      },
    );
  });
});
