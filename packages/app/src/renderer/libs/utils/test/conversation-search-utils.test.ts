import { describe, expect, it } from "vitest";
import { stripMarkdown } from "../conversation-search-utils";

describe("stripMarkdown", () => {
  it("removes bold and italic markers", () => {
    expect(stripMarkdown("**Paddle** is a _merchant_ of record")).toBe(
      "Paddle is a merchant of record",
    );
  });

  it("removes inline code, links and headings", () => {
    expect(stripMarkdown("# Title\nsee [docs](https://x.dev) and `code`")).toBe(
      "Title see docs and code",
    );
  });

  it("removes list bullets and collapses whitespace", () => {
    expect(stripMarkdown("- **Paddle**: 5% + $0.50\n- **Stripe**: 2.9%")).toBe(
      "Paddle: 5% + $0.50 Stripe: 2.9%",
    );
  });

  it("drops fenced code blocks", () => {
    expect(stripMarkdown("before\n```js\nconst x = 1;\n```\nafter")).toBe(
      "before after",
    );
  });
});
