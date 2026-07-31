import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, unlink } from "node:fs/promises";
import { dirname } from "node:path";

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

/**
 * Small atomic JSON primitive for main-process state. Writers fsync a
 * same-directory temporary file before rename, so a crash leaves either the
 * previous complete document or the next complete document.
 */
export class AtomicJsonFile {
  constructor(readonly path: string) {}

  async read(): Promise<unknown | undefined> {
    try {
      return JSON.parse(await readFile(this.path, "utf8")) as unknown;
    } catch (error) {
      if (isMissingFile(error)) return undefined;
      throw error;
    }
  }

  async write(value: unknown): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporaryPath = `${this.path}.${process.pid}.${randomUUID()}.tmp`;
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(temporaryPath, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporaryPath, this.path);
      await this.syncParentDirectory();
    } finally {
      await handle?.close().catch(() => undefined);
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }

  async clear(): Promise<void> {
    await unlink(this.path).catch((error: unknown) => {
      if (!isMissingFile(error)) throw error;
    });
    await this.syncParentDirectory();
  }

  private async syncParentDirectory(): Promise<void> {
    let directory: Awaited<ReturnType<typeof open>> | undefined;
    try {
      directory = await open(dirname(this.path), "r");
      await directory.sync();
    } catch (error) {
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : undefined;
      if (!["ENOENT", "EINVAL", "EPERM", "EISDIR"].includes(code ?? "")) {
        throw error;
      }
    } finally {
      await directory?.close().catch(() => undefined);
    }
  }
}
