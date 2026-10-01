import assert from "node:assert/strict";
import { test } from "node:test";
import { getReleaseSummary, RELEASES_URL } from "./release-info.ts";

test("missing releases never invent a version, date, asset or changelog", () => {
  assert.deepEqual(getReleaseSummary(null), {
    version: null,
    date: null,
    dmgUrl: null,
    dmgSize: "size unavailable",
    url: RELEASES_URL,
    notes: [],
  });
});
test("only a real Apple Silicon DMG becomes a download", () => {
  const result = getReleaseSummary({
    tag_name: "v1.2.3",
    published_at: "2026-09-01T00:00:00Z",
    body: "# Release\n- Fixed search\n* Improved keyboard access",
    assets: [
      {
        name: "Convera-x64.dmg",
        size: 1024,
        browser_download_url: "https://example.com/intel.dmg",
      },
      {
        name: "Convera-arm64.dmg",
        size: 1048576,
        browser_download_url: "https://example.com/arm.dmg",
      },
    ],
  });
  assert.equal(result.version, "1.2.3");
  assert.equal(result.date, "September 1, 2026");
  assert.equal(result.dmgUrl, "https://example.com/arm.dmg");
  assert.equal(result.dmgSize, "1.0 MB");
  assert.deepEqual(result.notes, ["Fixed search", "Improved keyboard access"]);
});
test("bad dates and missing notes remain unavailable", () => {
  const result = getReleaseSummary({
    tag_name: "v1",
    published_at: "bad-date",
    body: "No bullet notes",
    assets: [],
  });
  assert.equal(result.date, null);
  assert.equal(result.dmgUrl, null);
  assert.deepEqual(result.notes, []);
  assert.equal(result.url, `${RELEASES_URL}/tag/v1`);
});
