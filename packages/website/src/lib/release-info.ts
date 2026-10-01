export const RELEASES_URL = "https://github.com/CodeFox-Repo/Convera/releases";

export interface GitHubRelease {
  tag_name: string;
  body?: string | null;
  published_at?: string | null;
  assets: Array<{ name: string; browser_download_url: string; size: number }>;
}

/** Missing release data stays missing; never substitute an invented release. */
export function getReleaseSummary(release: GitHubRelease | null) {
  const dmg = release?.assets.find(
    (asset) => asset.name.endsWith(".dmg") && asset.name.includes("arm64"),
  );
  const date = release?.published_at ? new Date(release.published_at) : null;
  return {
    version: release?.tag_name.replace(/^v/, "") || null,
    date:
      date && !Number.isNaN(date.getTime())
        ? date.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
            timeZone: "UTC",
          })
        : null,
    dmgUrl: dmg?.browser_download_url ?? null,
    dmgSize: dmg?.size ? `${(dmg.size / (1024 * 1024)).toFixed(1)} MB` : "size unavailable",
    url: release?.tag_name
      ? `${RELEASES_URL}/tag/${encodeURIComponent(release.tag_name)}`
      : RELEASES_URL,
    notes: (release?.body ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^([-*]\s|\d+\.\s)/.test(line))
      .map((line) => line.replace(/^([-*]\s|\d+\.\s)/, ""))
      .slice(0, 6),
  };
}
