import { useEffect, useRef } from "react";

const hacks = [
  {
    img: "/images/hacks/card-inbox.jpg",
    tag: "gmail · mcp",
    title: "Triage the inbox before coffee",
    line: "Ask for the three emails that actually need you; archive the rest by rule.",
  },
  {
    img: "/images/hacks/card-research.jpg",
    tag: "web_fetch",
    title: "Read the docs so you don't",
    line: "Point it at pricing pages or API docs and get back the diff that matters.",
  },
  {
    img: "/images/hacks/card-messages.jpg",
    tag: "imessage · mcp",
    title: "Answer the group chat",
    line: "Draft the reply in your voice and send it without leaving the thread.",
  },
  {
    img: "/images/hacks/card-branch.jpg",
    tag: "branching",
    title: "Model both options",
    line: "Fork the thread at the decision point and let each path run to its end.",
  },
  {
    img: "/images/hacks/card-agents.jpg",
    tag: "custom agents",
    title: "An agent per job",
    line: "One for research, one for email — each sees only the tools it needs.",
  },
  {
    img: "/images/hacks/card-search.jpg",
    tag: "local search",
    title: "Find that one thing",
    line: "Everything you ever said is indexed on disk; ⌘K remembers it for you.",
  },
];

const HacksCarousel = () => {
  const trackRef = useRef<HTMLDivElement>(null);
  const paused = useRef(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      const track = trackRef.current;
      if (!track || paused.current) return;
      const card = track.firstElementChild as HTMLElement | null;
      if (!card) return;
      const step = card.offsetWidth + 20;
      const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - step / 2;
      track.scrollTo({ left: atEnd ? 0 : track.scrollLeft + step, behavior: "smooth" });
    }, 3500);
    return () => clearInterval(id);
  }, []);

  const nudge = (dir: number) => {
    const track = trackRef.current;
    const card = track?.firstElementChild as HTMLElement | null;
    if (!track || !card) return;
    track.scrollBy({ left: dir * (card.offsetWidth + 20), behavior: "smooth" });
  };

  return (
    <div onMouseEnter={() => (paused.current = true)} onMouseLeave={() => (paused.current = false)}>
      <div
        ref={trackRef}
        className="scrollbar-hide -mx-[var(--page-gutter)] flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth px-[var(--page-gutter)] pb-2"
      >
        {hacks.map((hack) => (
          <article
            key={hack.tag}
            className="border-rule bg-well w-[320px] shrink-0 snap-start overflow-hidden rounded-[13px] border sm:w-[420px]"
          >
            <img src={hack.img} alt="" aria-hidden className="aspect-[3/2] w-full object-cover" />
            <div className="border-rule border-t p-5 text-left">
              <p className="text-terracotta font-mono text-[11px] tracking-[0.14em] uppercase">
                {hack.tag}
              </p>
              <h3 className="text-ink mt-2 text-lg font-bold tracking-[-0.015em]">{hack.title}</h3>
              <p className="text-ink-muted mt-1.5 text-sm leading-relaxed">{hack.line}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="mt-6 flex items-center gap-2">
        <button
          onClick={() => nudge(-1)}
          aria-label="Previous card"
          className="border-rule text-ink-muted hover:border-terracotta-line hover:text-ink rounded-[9px] border px-3 py-1 font-mono text-[13px] transition-colors"
        >
          ←
        </button>
        <button
          onClick={() => nudge(1)}
          aria-label="Next card"
          className="border-rule text-ink-muted hover:border-terracotta-line hover:text-ink rounded-[9px] border px-3 py-1 font-mono text-[13px] transition-colors"
        >
          →
        </button>
        <span className="text-ink-faint ml-2 font-mono text-[11px]">
          drifts on its own · hover to hold
        </span>
      </div>
    </div>
  );
};

export default HacksCarousel;
