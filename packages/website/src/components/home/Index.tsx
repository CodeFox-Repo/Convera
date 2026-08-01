import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import HacksCarousel from "./HacksCarousel";

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
      {/* ── hero — centered title over generated bg, then the film ── */}
      <section className="relative overflow-hidden pt-36 pb-20 md:pt-44" data-rise>
        <img
          src="/images/hero-bg.jpg"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full [mask-image:linear-gradient(to_bottom,#000_82%,transparent_100%)] object-cover"
        />
        <div className="bg-grid" aria-hidden />

        <div className="relative mx-auto w-full max-w-[1180px] px-[var(--page-gutter)] text-center">
          <p
            className="rise text-ink-faint font-mono text-[11px] tracking-[0.14em] uppercase"
            style={slot(0)}
          >
            a chatbot answers you → <span className="text-terracotta">colleagues work with you</span>
          </p>

          <h1
            className="rise mx-auto mt-6 max-w-[16ch] text-[clamp(2.75rem,7vw,5.5rem)] leading-[1.0] font-bold tracking-[-0.04em]"
            style={slot(1)}
          >
            AI colleagues in <span className="text-terracotta">your workspace.</span>
          </h1>

          <p
            className="rise text-ink-muted mx-auto mt-6 max-w-[56ch] text-[1.0625rem] leading-relaxed"
            style={slot(2)}
          >
            Channels, colleagues, direct messages — a workplace on your machine where agents read
            the room, answer when spoken to, and stay out of conversations that aren&apos;t theirs.
            Everything lives in a database on your disk.
          </p>

          <div
            className="rise mt-8 flex flex-wrap items-center justify-center gap-4"
            style={slot(3)}
          >
            <Button size="lg" className="rounded-lg px-7 font-medium" asChild>
              <Link to="/download">Download for macOS</Link>
            </Button>
          </div>

          <figure className="rise mt-16" style={slot(4)}>
            <div className="border-rule bg-well overflow-hidden rounded-[13px] border">
              <video
                src="/demos/app-tour.mp4"
                autoPlay
                muted
                loop
                playsInline
                className="w-full"
                aria-label="Screen recording of Convera: greeting the room, three colleagues answering in their own voices, a name-drop reaching only the person named, reacting, searching in Chinese, and asking the assistant"
              />
            </div>
            <figcaption className="text-ink-faint mt-4 font-mono text-xs leading-relaxed">
              <span className="text-ink-2">
                greet the room → name-drop one colleague → react → search → ask Convera
              </span>{" "}
              · the real app, real model replies, one take with the waiting cut out
            </figcaption>
          </figure>

          <p
            className="rise text-ink-faint mt-10 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 font-mono text-[13px]"
            style={slot(5)}
          >
            one workspace =
            <span className="border-rule text-ink-3 rounded-[7px] border px-2 py-0.5">
              channels
            </span>
            <span className="text-ink-ghost">+</span>
            <span className="border-rule text-ink-3 rounded-[7px] border px-2 py-0.5">
              colleagues
            </span>
            <span className="text-ink-ghost">+</span>
            <span className="border-rule text-ink-3 rounded-[7px] border px-2 py-0.5">
              a database you own
            </span>
          </p>
        </div>
      </section>

      {/* ── 1.0 colleagues ───────────────────────────────────── */}
      <section className="stage mt-16 py-16 md:py-20" data-rise>
        <div className="mx-auto grid w-full max-w-[1180px] gap-12 px-[var(--page-gutter)] md:grid-cols-2 md:gap-16">
          <div>
            <p className="stage-label rise" style={slot(0)}>
              1.0 · colleagues
            </p>
            <h2
              className="rise mt-4 max-w-[20ch] text-[clamp(1.75rem,3.4vw,2.5rem)] leading-[1.08] font-bold tracking-[-0.025em]"
              style={slot(1)}
            >
              Agents that read the room, not a bot that answers everything.
            </h2>
            <p className="rise text-ink-muted mt-5 max-w-[52ch] leading-relaxed" style={slot(2)}>
              Elena reviews code. Mika chases bugs. Noah writes the docs. Greet the room and each
              answers in their own voice — name one of them, even casually, and the others stay out
              of it. They look things up themselves, keep their own notes, and 👍 a plan instead of
              writing a paragraph about it.
            </p>
            <p className="rise text-ink-faint mt-5 font-mono text-[13px]" style={slot(3)}>
              No routing rules decide who talks. Each colleague reads the message and decides —
              like people do.
            </p>
          </div>
          <pre className="chat-plate rise self-center" style={slot(2)}>
            <span className="role">you</span>
            {"     "}
            <span className="you">elena 最近在忙什么</span>
            {"\n"}
            <span className="agent">elena</span>
            <span className="off"> 在看一处容易被忽略的失败路径…</span>
            {"\n"}
            <span className="dim">mika — read it, stayed out</span>
            {"\n"}
            <span className="dim">noah — read it, stayed out</span>
            {"\n"}
            <span className="tool">✓ no @ needed</span>
            <span className="off"> a name is an address</span>
          </pre>
        </div>
      </section>

      {/* ── 2.0 keep ─────────────────────────────────────────── */}
      <section className="stage py-16 md:py-20" data-rise>
        <div className="mx-auto grid w-full max-w-[1180px] gap-12 px-[var(--page-gutter)] md:grid-cols-2 md:gap-16">
          <div>
            <p className="stage-label rise" style={slot(0)}>
              2.0 · keep
            </p>
            <h2
              className="rise mt-4 max-w-[20ch] text-[clamp(1.75rem,3.4vw,2.5rem)] leading-[1.08] font-bold tracking-[-0.025em]"
              style={slot(1)}
            >
              Everything you say stays in a database you own.
            </h2>
            <p className="rise text-ink-muted mt-5 max-w-[52ch] leading-relaxed" style={slot(2)}>
              Conversations, messages, agents and model configs live in a local database — not on a
              sync server you have to trust. Global search covers all of it, instantly, offline. And
              a fail-closed guard throws before any request containing an API key can leave the
              machine.
            </p>
            <p className="rise text-ink-faint mt-5 font-mono text-[13px]" style={slot(3)}>
              Delete the app and the folder — the record is gone. That's the whole cloud story.
            </p>
          </div>
          <pre className="chat-plate rise self-center" style={slot(2)}>
            <span className="role">⌘K</span>
            {"  "}
            <span className="you">"pricing deck"</span>
            {"\n"}
            <span className="tool">● search</span>
            <span className="off"> local index · 0 network calls</span>
            {"\n"}
            <span className="agent">18 hits in 6 conversations</span>
            {"\n"}
            <span className="dim">▸ newest: "q3 launch plan" — 2 days ago</span>
            {"\n"}
            <span className="tool">✓ credential guard</span>
            <span className="off"> keys never leave this machine</span>
          </pre>
        </div>
      </section>

      {/* ── 3.0 branch ───────────────────────────────────────── */}
      <section className="stage py-16 md:py-20" data-rise>
        <div className="mx-auto grid w-full max-w-[1180px] gap-12 px-[var(--page-gutter)] md:grid-cols-2 md:gap-16">
          <pre className="chat-plate order-last self-center md:order-first" style={slot(2)}>
            <span className="role">you</span>
            {"      "}
            <span className="you">redo this, but for enterprise buyers</span>
            {"\n"}
            <span className="tool">● branch</span>
            <span className="off"> from message #14</span>
            {"\n"}
            <span className="agent">"landing copy (branch)" — 14 messages carried over</span>
            {"\n"}
            <span className="dim">▸ original thread untouched</span>
          </pre>
          <div>
            <p className="stage-label rise" style={slot(0)}>
              3.0 · branch
            </p>
            <h2
              className="rise mt-4 max-w-[18ch] text-[clamp(1.75rem,3.4vw,2.5rem)] leading-[1.08] font-bold tracking-[-0.025em]"
              style={slot(1)}
            >
              Fork the conversation, not your patience.
            </h2>
            <p className="rise text-ink-muted mt-5 max-w-[52ch] leading-relaxed" style={slot(2)}>
              Pick any reply and branch a new conversation from it. The context up to that point
              carries over; the original stays exactly as it was. Try two framings, two audiences,
              two models — and keep both threads.
            </p>
            <p className="rise text-ink-faint mt-5 font-mono text-[13px]" style={slot(3)}>
              One thread is a coin flip. A branch is a comparison.
            </p>
          </div>
        </div>
      </section>

      {/* ── 4.0 extend ───────────────────────────────────────── */}
      <section className="stage py-16 md:py-20" data-rise>
        <div className="mx-auto grid w-full max-w-[1180px] gap-12 px-[var(--page-gutter)] md:grid-cols-2 md:gap-16">
          <div>
            <p className="stage-label rise" style={slot(0)}>
              4.0 · extend
            </p>
            <h2
              className="rise mt-4 max-w-[18ch] text-[clamp(1.75rem,3.4vw,2.5rem)] leading-[1.08] font-bold tracking-[-0.025em]"
              style={slot(1)}
            >
              Every capability is a plug-in, not a promise.
            </h2>
            <p className="rise text-ink-muted mt-5 max-w-[52ch] leading-relaxed" style={slot(2)}>
              Convera speaks Model Context Protocol — point it at any stdio or HTTP server and its
              tools show up in chat. Build your own agents and choose per agent which tools they're
              allowed to touch. What the assistant can do is a list you control, not a roadmap you
              wait for.
            </p>
            <p className="rise text-ink-faint mt-5 font-mono text-[13px]" style={slot(3)}>
              An open protocol means the tools outlive this app — and yours plug in too.
            </p>
          </div>
          <pre className="chat-plate rise self-center" style={slot(2)}>
            <span className="role">$</span> <span className="agent">~/.convera/mcp.json</span>
            {"\n"}
            <span className="tool">✓ imessage</span>
            <span className="off"> stdio</span>
            {"\n"}
            <span className="tool">✓ gmail</span>
            <span className="off"> http</span>
            {"\n"}
            <span className="tool">✓ your-server</span>
            <span className="off"> any mcp server plugs in</span>
            {"\n"}
            <span className="dim">agent "research" → tools: web_fetch · gmail</span>
          </pre>
        </div>
      </section>

      {/* ── 5.0 hacks — use-case carousel ────────────────────── */}
      <section className="stage py-16 md:py-20" data-rise>
        <div className="mx-auto w-full max-w-[1180px] px-[var(--page-gutter)]">
          <p className="stage-label rise" style={slot(0)}>
            5.0 · hacks
          </p>
          <h2
            className="rise mt-4 max-w-[20ch] text-[clamp(1.75rem,3.4vw,2.5rem)] leading-[1.08] font-bold tracking-[-0.025em]"
            style={slot(1)}
          >
            Little hacks, big afternoons.
          </h2>
          <p className="rise text-ink-muted mt-5 max-w-[52ch] leading-relaxed" style={slot(2)}>
            Six things people wire Convera into in the first week — each one is a conversation plus
            a tool, not a feature request.
          </p>
          <div className="rise mt-10" style={slot(3)}>
            <HacksCarousel />
          </div>
        </div>
      </section>

      {/* ── 6.0 next — honest roadmap, not vaporware ─────────── */}
      <section className="stage py-16 md:py-20" data-rise>
        <div className="mx-auto w-full max-w-[1180px] px-[var(--page-gutter)]">
          <p className="stage-label rise" style={slot(0)}>
            6.0 · next
          </p>
          <h2
            className="rise mt-4 max-w-[20ch] text-[clamp(1.75rem,3.4vw,2.5rem)] leading-[1.08] font-bold tracking-[-0.025em]"
            style={slot(1)}
          >
            What's landing next.
          </h2>
          <div className="mt-10 grid gap-12 md:grid-cols-2 md:gap-16">
            <div className="rise border-rule-2 border-l-2 pl-6" style={slot(2)}>
              <h3 className="text-terracotta-soft font-mono text-[13px]">
                colleagues that clone repos
              </h3>
              <p className="text-ink-muted mt-3 max-w-[46ch] text-[0.9375rem] leading-relaxed">
                Each agent already has an OS-sandboxed workspace with a shell, file tools and its
                own notebook — shipped in 0.1.0. Next: handing one a repo and a task in a channel,
                and getting a diff back.
              </p>
            </div>
            <div className="rise border-rule-2 border-l-2 pl-6" style={slot(3)}>
              <h3 className="text-terracotta-soft font-mono text-[13px]">windows &amp; linux</h3>
              <p className="text-ink-muted mt-3 max-w-[46ch] text-[0.9375rem] leading-relaxed">
                They ship when the agent sandbox&apos;s OS enforcement covers them — bubblewrap on
                Linux is the near one. We won&apos;t release a build where the safety story is
                weaker than this page claims.
              </p>
            </div>
          </div>
          <p className="rise text-ink-faint mt-10 font-mono text-[13px]" style={slot(4)}>
            We'd rather tell you what's a branch than sell you what's a wish.
          </p>
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
              Put your record where you can keep it.
            </h2>
            <p className="rise text-ink-muted mt-5 max-w-[52ch] leading-relaxed" style={slot(1)}>
              One brew command and you&apos;re standing in a workspace with three colleagues.
              If something feels wrong in the first minute, tell us in Discord — that&apos;s a bug
              worth filing.
            </p>
            <code className="rise bg-well border-rule mt-6 block w-fit overflow-x-auto rounded-md border px-3 py-2 font-mono text-[13px]" style={slot(1)}>
              brew install --cask codefox-repo/codefox/convera
            </code>
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
              macOS · beta
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Index;
