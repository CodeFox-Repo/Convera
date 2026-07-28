import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import DemoVideoSection from "./DemoVideoSection";

/* stagger helper: sets the entrance delay slot for a .rise child */
const slot = (i: number) => ({ "--i": i }) as React.CSSProperties;

const Index = () => {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 },
    );
    document.querySelectorAll("[data-rise]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      {/* ── hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-36 pb-20 md:pt-44" data-rise>
        <div className="bg-grid" aria-hidden />
        <div className="bloom" aria-hidden />

        <div className="relative mx-auto w-full max-w-[1180px] px-[var(--page-gutter)]">
          <p
            className="rise text-ink-faint font-mono text-[11px] tracking-[0.14em] uppercase"
            style={slot(0)}
          >
            chat window → browser copilot → <span className="text-terracotta">desktop agent</span>
          </p>

          <h1
            className="rise mt-6 max-w-[16ch] text-[clamp(2.5rem,5.5vw,4.25rem)] leading-[1.02] font-bold tracking-[-0.035em]"
            style={slot(1)}
          >
            Your desktop is the <span className="text-terracotta">context window.</span>
          </h1>

          <p
            className="rise text-ink-muted mt-6 max-w-[52ch] text-[1.0625rem] leading-relaxed"
            style={slot(2)}
          >
            Convera is an AI assistant that runs beside your apps — it sees the window you're in,
            listens when you talk, and acts through MCP tools. One hotkey, any app, no
            tab-switching.
          </p>

          <div className="rise mt-8 flex flex-wrap items-center gap-4" style={slot(3)}>
            <Button size="lg" className="rounded-lg px-7 font-medium" asChild>
              <Link to="/download">Download for macOS</Link>
            </Button>
            <span className="border-rule bg-paper-2 text-ink-3 flex items-center gap-3 rounded-lg border px-4 py-2.5 font-mono text-[13px]">
              <kbd className="text-terracotta-soft">⌥ Space</kbd>
              <span className="border-rule text-ink-faint border-l pl-3">summon anywhere</span>
            </span>
            <a
              href="https://docs.foxychat.net/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-muted hover:text-ink font-mono text-[13px] underline underline-offset-4 transition-colors"
            >
              read the docs →
            </a>
          </div>

          <figure
            className="rise border-rule bg-well mt-16 overflow-hidden rounded-[13px] border"
            style={slot(4)}
          >
            <img src="/images/demo.jpg" alt="Convera running on the desktop" className="w-full" />
          </figure>

          <p
            className="rise text-ink-faint mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[13px]"
            style={slot(5)}
          >
            one call =
            <span className="border-rule text-ink-3 rounded-[7px] border px-2 py-0.5">
              frontmost app
            </span>
            <span className="text-ink-ghost">+</span>
            <span className="border-rule text-ink-3 rounded-[7px] border px-2 py-0.5">
              your words
            </span>
            <span className="text-ink-ghost">+</span>
            <span className="border-rule text-ink-3 rounded-[7px] border px-2 py-0.5">
              mcp tools
            </span>
          </p>
        </div>
      </section>

      {/* ── 1.0 see ──────────────────────────────────────────── */}
      <section className="stage mt-16 py-16 md:py-20" data-rise>
        <div className="mx-auto grid w-full max-w-[1180px] gap-12 px-[var(--page-gutter)] md:grid-cols-2 md:gap-16">
          <div>
            <p className="stage-label rise" style={slot(0)}>
              1.0 · see
            </p>
            <h2
              className="rise mt-4 max-w-[18ch] text-[clamp(1.75rem,3.4vw,2.5rem)] leading-[1.08] font-bold tracking-[-0.025em]"
              style={slot(1)}
            >
              It already knows what you're looking at.
            </h2>
            <p className="rise text-ink-muted mt-5 max-w-[52ch] leading-relaxed" style={slot(2)}>
              Summon Convera and the frontmost window is the prompt's first line — the file, the
              thread, the selection. You ask about "this"; it knows what "this" is. No pasting, no
              re-explaining your screen to a chatbot.
            </p>
            <p className="rise text-ink-faint mt-5 font-mono text-[13px]" style={slot(3)}>
              Context is captured at call time, not recorded in the background.
            </p>
          </div>
          <pre className="chat-plate rise self-center" style={slot(2)}>
            <span className="dim">▸ frontmost: Figma — checkout-v2.fig</span>
            {"\n"}
            <span className="role">you</span>
            {"     "}
            <span className="you">what changed here since yesterday?</span>
            {"\n"}
            <span className="tool">● figma.get_comments</span>
            <span className="off"> 126ms</span>
            {"\n"}
            <span className="role">convera</span>{" "}
            <span className="agent">3 threads resolved. 1 open blocker</span>
            {"\n"}
            {"        "}
            <span className="agent">from Ana on the payment frame.</span>
          </pre>
        </div>
      </section>

      {/* ── 2.0 speak ────────────────────────────────────────── */}
      <section className="stage py-16 md:py-20" data-rise>
        <div className="mx-auto grid w-full max-w-[1180px] gap-12 px-[var(--page-gutter)] md:grid-cols-2 md:gap-16">
          <pre className="chat-plate order-last self-center md:order-first" style={slot(2)}>
            <span className="role">◉ listening</span>
            <span className="off"> 0:04</span>
            {"\n"}
            <span className="you">"file every screenshot in downloads</span>
            {"\n"}
            <span className="you"> into folders by month"</span>
            {"\n"}
            <span className="tool">● fs.scan</span>
            <span className="off"> ~/Downloads · 312 matches</span>
            {"\n"}
            <span className="tool">● fs.move</span>
            <span className="off"> 2025-11 … 2026-07</span>
            {"\n"}
            <span className="tool">✓ 312 files filed.</span>
            <span className="dim"> nothing deleted.</span>
          </pre>
          <div>
            <p className="stage-label rise" style={slot(0)}>
              2.0 · speak
            </p>
            <h2
              className="rise mt-4 max-w-[18ch] text-[clamp(1.75rem,3.4vw,2.5rem)] leading-[1.08] font-bold tracking-[-0.025em]"
              style={slot(1)}
            >
              Say it. Typing was the workaround.
            </h2>
            <p className="rise text-ink-muted mt-5 max-w-[52ch] leading-relaxed" style={slot(2)}>
              Voice input is not a dictation box — it's the same agent with the same context and the
              same tools. Describe the outcome in one sentence; Convera does the clicking, moving
              and renaming that sentence implies.
            </p>
            <p className="rise text-ink-faint mt-5 font-mono text-[13px]" style={slot(3)}>
              Every action is a named tool call — read the log, not the marketing.
            </p>
          </div>
        </div>
      </section>

      {/* ── 3.0 extend ───────────────────────────────────────── */}
      <section className="stage py-16 md:py-20" data-rise>
        <div className="mx-auto grid w-full max-w-[1180px] gap-12 px-[var(--page-gutter)] md:grid-cols-2 md:gap-16">
          <div>
            <p className="stage-label rise" style={slot(0)}>
              3.0 · extend
            </p>
            <h2
              className="rise mt-4 max-w-[18ch] text-[clamp(1.75rem,3.4vw,2.5rem)] leading-[1.08] font-bold tracking-[-0.025em]"
              style={slot(1)}
            >
              Every capability is a plug-in, not a promise.
            </h2>
            <p className="rise text-ink-muted mt-5 max-w-[52ch] leading-relaxed" style={slot(2)}>
              Convera speaks Model Context Protocol. iMessage, Gmail, your browser, your own stdio
              server — install them from the app market or point Convera at any MCP endpoint. What
              the assistant can do is a list you control, not a roadmap you wait for.
            </p>
            <p className="rise text-ink-faint mt-5 font-mono text-[13px]" style={slot(3)}>
              An open protocol means the tools outlive this app — and yours plug in too.
            </p>
          </div>
          <pre className="chat-plate rise self-center" style={slot(2)}>
            <span className="role">$</span> <span className="agent">convera mcp list</span>
            {"\n"}
            <span className="tool">✓ imessage</span>
            <span className="off"> send · read · contacts</span>
            {"\n"}
            <span className="tool">✓ gmail</span>
            <span className="off"> oauth · labels · attachments</span>
            {"\n"}
            <span className="tool">✓ browser</span>
            <span className="off"> open · read · fill</span>
            {"\n"}
            <span className="dim">○ notion</span>
            <span className="off"> available in market</span>
          </pre>
        </div>
      </section>

      {/* ── 4.0 watch ────────────────────────────────────────── */}
      <section className="stage py-16 md:py-20" data-rise>
        <div className="mx-auto w-full max-w-[1180px] px-[var(--page-gutter)]">
          <p className="stage-label rise" style={slot(0)}>
            4.0 · watch
          </p>
          <h2
            className="rise mt-4 max-w-[20ch] text-[clamp(1.75rem,3.4vw,2.5rem)] leading-[1.08] font-bold tracking-[-0.025em]"
            style={slot(1)}
          >
            Real runs, recorded.
          </h2>
          <p className="rise text-ink-muted mt-5 max-w-[52ch] leading-relaxed" style={slot(2)}>
            No mockups — screen recordings of Convera doing the work, tool calls and all.
          </p>
          <div className="rise mt-10" style={slot(3)}>
            <DemoVideoSection />
          </div>
        </div>
      </section>

      {/* ── install / CTA — same language, no big empty card ─── */}
      <section className="stage py-16 md:py-20" data-rise>
        <div className="mx-auto w-full max-w-[1180px] px-[var(--page-gutter)]">
          <div className="max-w-[720px]">
            <h2
              className="rise text-[clamp(1.75rem,3.4vw,2.5rem)] leading-[1.08] font-bold tracking-[-0.025em]"
              style={slot(0)}
            >
              Put it next to your work.
            </h2>
            <p className="rise text-ink-muted mt-5 max-w-[52ch] leading-relaxed" style={slot(1)}>
              Download the beta, press the hotkey inside whatever you're doing, and ask. If the
              first minute doesn't save you a minute, tell us in Discord — that's a bug worth
              filing.
            </p>
            <div className="rise mt-8 flex flex-wrap items-center gap-4" style={slot(2)}>
              <Button size="lg" className="rounded-lg px-7 font-medium" asChild>
                <Link to="/download">Download for macOS</Link>
              </Button>
              <a
                href="https://discord.gg/convera"
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink-muted hover:text-ink font-mono text-[13px] underline underline-offset-4 transition-colors"
              >
                join the discord
              </a>
              <Link
                to="/pricing"
                className="text-ink-muted hover:text-ink font-mono text-[13px] underline underline-offset-4 transition-colors"
              >
                pricing
              </Link>
            </div>
            <p className="rise text-ink-faint mt-8 font-mono text-xs" style={slot(3)}>
              macOS · beta · free tier included
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Index;
