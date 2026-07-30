import { describe, expect, it, vi } from "vitest";
import { ConveraDriver } from "./driver.js";

describe("ConveraDriver click", () => {
  it("returns the pre-click snapshot when the clicked element disappears", async () => {
    let exists = true;
    const click = vi.fn(async () => {
      exists = false;
    });
    const element = {
      attributes: [{ name: "role", value: "option" }],
      click,
      doubleClick: vi.fn(),
      getTagName: vi.fn(async () => "button"),
      getText: vi.fn(async () => "Alpha"),
      getValue: vi.fn(async () => null),
      isClickable: vi.fn(async () => exists),
      isDisplayed: vi.fn(async () => exists),
      isEnabled: vi.fn(async () => true),
      isExisting: vi.fn(async () => exists),
      waitForDisplayed: vi.fn(async () => undefined),
      waitForExist: vi.fn(async () => undefined),
    };
    const browser = {
      $: vi.fn(async () => element),
      execute: vi.fn(
        async (
          operation: (node: typeof element) => unknown,
          node: typeof element,
        ) => operation(node),
      ),
      waitUntil: vi.fn(async (condition: () => Promise<boolean>) => {
        if (!(await condition())) throw new Error("condition not met");
        return true;
      }),
    };
    const driver = new ConveraDriver();
    Reflect.set(driver, "browser", browser);

    await expect(driver.click('[role="option"]')).resolves.toMatchObject({
      selector: '[role="option"]',
      tag: "button",
      text: "Alpha",
      displayed: true,
      enabled: true,
      clickable: true,
      attributes: { role: "option" },
      action: "click",
      completed: true,
    });
    expect(click).toHaveBeenCalledOnce();
    expect(browser.$).toHaveBeenCalledTimes(2);
    expect(element.isExisting).toHaveBeenCalledTimes(1);
  });
});
