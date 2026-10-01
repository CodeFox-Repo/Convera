// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useLocalAIProviders } from "./use-local-ai-providers";
import type { ILocalAIAPI } from "@/shared/types/local-ai";
// Use the app’s React and ReactDOM pair. The workspace’s testing-library
// installation brings a second React copy through the website’s dependencies.
let root: Root | undefined;
let container: HTMLDivElement | undefined;
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
async function renderHook(hook: typeof useLocalAIProviders) {
  const result = { current: undefined as unknown as ReturnType<typeof hook> };
  function Probe() {
    result.current = hook();
    return null;
  }
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(Probe));
  });
  return { result };
}
async function waitFor(assertion: () => void) {
  await act(async () => {});
  assertion();
}
const ready = [
  {
    id: "openai-api",
    name: "OpenAI API",
    kind: "openai-api",
    availability: "available",
  },
];
const setup = (listProviders: ReturnType<typeof vi.fn>) => {
  Object.defineProperty(window, "localAI", {
    configurable: true,
    value: { listProviders } as unknown as ILocalAIAPI,
  });
};
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  Object.defineProperty(window, "localAI", {
    configurable: true,
    value: undefined,
  });
});

describe("provider refresh feedback", () => {
  it("reports a missing bridge without an unhandled rejection", async () => {
    const { result } = await renderHook(useLocalAIProviders);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toContain("restart Convera");
    expect(
      result.current.providers.every((p) => p.availability === "unavailable"),
    ).toBe(true);
  });
  it("clears stale ready statuses after failure and recovers on retry", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ success: true, data: ready })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ success: true, data: ready });
    setup(list);
    const { result } = await renderHook(useLocalAIProviders);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.providers[0].availability).toBe("available");
    await act(() => result.current.refresh());
    expect(result.current.error).toContain("Re-check providers");
    expect(
      result.current.providers.every((p) => p.availability === "unavailable"),
    ).toBe(true);
    await act(() => result.current.refresh());
    expect(result.current.error).toBeNull();
    expect(result.current.providers[0].availability).toBe("available");
  });
  it("shows checking while refreshing and ignores older results", async () => {
    let resolveOlder!: (value: unknown) => void;
    const list = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOlder = resolve;
          }),
      )
      .mockResolvedValueOnce({ success: true, data: ready });
    setup(list);
    const { result } = await renderHook(useLocalAIProviders);
    expect(result.current.loading).toBe(true);
    await act(() => result.current.refresh());
    await act(async () => resolveOlder({ success: false }));
    expect(result.current.error).toBeNull();
    expect(result.current.providers[0].availability).toBe("available");
  });
  it("handles unsuccessful IPC responses as a visible failed check", async () => {
    setup(vi.fn().mockResolvedValue({ success: false }));
    const { result } = await renderHook(useLocalAIProviders);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toContain("Couldn’t check");
  });
});
