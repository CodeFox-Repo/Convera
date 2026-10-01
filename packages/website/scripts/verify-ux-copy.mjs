import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Run against the real Vite renderer. Only network replies and clipboard failure
// are fixtures: no recreated UI, test-only components, account or model calls.
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const output = process.env.EVIDENCE_DIR ?? "ux-evidence";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const release = {
  tag_name: "v0.1.0",
  published_at: "2026-08-01T20:19:45Z",
  body: "## What changed\n- Conversation branching\n- Local provider settings",
  assets: [
    {
      name: "Convera-0.1.0-arm64.dmg",
      size: 114630244,
      browser_download_url:
        "https://github.com/CodeFox-Repo/Convera/releases/download/v0.1.0/Convera-0.1.0-arm64.dmg",
    },
  ],
};
try {
  for (const [version, base] of [
    ["before", process.env.BEFORE_URL],
    ["after", process.env.AFTER_URL],
  ]) {
    for (const [viewportName, viewport] of [
      ["desktop", { width: 1440, height: 1080 }],
      ["mobile", { width: 390, height: 844 }],
    ]) {
      const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
      let failRelease = false;
      let requests = 0;
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.href.includes("api.github.com/repos/CodeFox-Repo/Convera/releases/latest")) {
          requests++;
          return route.fulfill({
            status: failRelease ? 503 : 200,
            contentType: "application/json",
            body: JSON.stringify(failRelease ? { message: "fixture unavailable" } : release),
          });
        }
        if (url.origin === new URL(base).origin) return route.continue();
        // Production auth APIs are never reached by this test.
        return route.fulfill({ status: 200, contentType: "application/json", body: "null" });
      });
      const page = await context.newPage();
      await page.goto(base, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "AI colleagues in your workspace." }).waitFor();
      await page.screenshot({ path: join(output, `${version}-${viewportName}-home.png`) });
      const privacy = page.getByRole("heading", {
        name:
          version === "before"
            ? "Everything you say stays in a database you own."
            : "Your chat history, stored on your device.",
      });
      await privacy.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500); // CSS entrance transition, not an application assertion
      await page.screenshot({ path: join(output, `${version}-${viewportName}-privacy.png`) });
      if (version === "after")
        assert.match(
          await page.locator("body").innerText(),
          /Provider terms, data policies and usage charges apply/,
        );
      await page.goto(`${base}/download`, { waitUntil: "networkidle" });
      await page.getByText("v0.1.0", { exact: true }).waitFor();
      await page.screenshot({ path: join(output, `${version}-${viewportName}-download.png`) });
      failRelease = true;
      await page.reload({ waitUntil: "networkidle" });
      await page
        .getByText(version === "before" ? "⚠️ Using fallback data" : "Version unavailable", {
          exact: true,
        })
        .waitFor();
      await page.screenshot({ path: join(output, `${version}-${viewportName}-release-error.png`) });
      if (version === "after") {
        const body = await page.locator("body").innerText();
        assert.ok(!body.includes("v0.0.8"));
        assert.ok(!body.includes("Initial public release"));
        assert.equal(
          await page
            .getByRole("button", { name: "macOS DMG unavailable", exact: true })
            .isDisabled(),
          true,
        );
        failRelease = false;
        const priorRequests = requests;
        await page.getByRole("button", { name: "Try again", exact: true }).click();
        await page.getByText("v0.1.0", { exact: true }).waitFor();
        assert.ok(requests > priorRequests);
        assert.equal(await page.getByRole("alert").count(), 0);
        await page.evaluate(() => {
          Object.defineProperty(navigator, "clipboard", {
            value: {
              writeText: async () => {
                throw new Error("fixture denied");
              },
            },
            configurable: true,
          });
        });
        await page
          .getByRole("button", { name: "Copy Homebrew install command", exact: true })
          .click();
        await page.getByText("Couldn’t copy the command", { exact: true }).waitFor();
        await page.screenshot({ path: join(output, `${version}-${viewportName}-copy-error.png`) });
        assert.equal(await page.getByText("Install command copied", { exact: true }).count(), 0);
        if (viewportName === "mobile") {
          await page.getByRole("button", { name: "Open menu", exact: true }).click();
          assert.equal(
            await page
              .getByRole("button", { name: "Close menu", exact: true })
              .getAttribute("aria-expanded"),
            "true",
          );
          await page.getByRole("button", { name: "Close menu", exact: true }).click();
          assert.equal(
            await page
              .getByRole("button", { name: "Open menu", exact: true })
              .getAttribute("aria-expanded"),
            "false",
          );
        }
      }
      results.push({ version, viewportName, passed: true, releaseRequests: requests });
      await context.close();
    }
  }
  await writeFile(join(output, "results.json"), JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
