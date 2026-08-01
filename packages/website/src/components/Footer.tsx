import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import LogoBrand from "./LogoBrand";

const columnLabel = "text-ink-3 font-mono text-[11px] tracking-[0.14em] uppercase";
const columnLink =
  "text-ink-muted hover:text-ink block py-1 text-sm transition-colors";

/**
 * CTA banner over the generated landscape, then a link grid — the Prism-style
 * close, in this site's own paper-and-terracotta language.
 */
const Footer = () => {
  return (
    <footer className="mt-16 w-full">
      {/* ── CTA banner ── */}
      <div className="mx-auto w-full max-w-[1180px] px-[var(--page-gutter)]">
        <div className="border-rule relative overflow-hidden rounded-[13px] border">
          <img
            src="/images/footer-cta.jpg"
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="relative px-6 py-16 text-center md:py-24">
            <h2 className="text-ink mx-auto max-w-[24ch] text-[clamp(1.75rem,3.6vw,2.75rem)] leading-[1.08] font-bold tracking-[-0.03em]">
              Colleagues, not chatbots.
            </h2>
            <p className="text-ink-3 mx-auto mt-4 max-w-[44ch] text-[0.9375rem] leading-relaxed">
              A workspace on your machine where agents read the room and the
              record stays yours.
            </p>
            <Button size="lg" className="mt-8 rounded-full px-7 font-medium" asChild>
              <Link to="/download">Get Convera →</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* ── link grid ── */}
      <div className="mx-auto w-full max-w-[1180px] px-[var(--page-gutter)] py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1.4fr]">
          <div>
            <LogoBrand size="md" linkable={true} />
            <p className="text-ink-muted mt-4 max-w-[36ch] text-sm leading-relaxed">
              AI colleagues in a workspace on your machine. Channels, direct
              messages, and a database you own.
            </p>
          </div>

          <div>
            <p className={columnLabel}>Product</p>
            <nav className="mt-4">
              <Link to="/download" className={columnLink}>
                Download
              </Link>
              <Link to="/pricing" className={columnLink}>
                Pricing
              </Link>
              <a
                href="https://github.com/CodeFox-Repo/Convera/releases"
                target="_blank"
                rel="noopener noreferrer"
                className={columnLink}
              >
                Changelog
              </a>
            </nav>
          </div>

          <div>
            <p className={columnLabel}>Community</p>
            <nav className="mt-4">
              <a
                href="https://github.com/CodeFox-Repo/Convera"
                target="_blank"
                rel="noopener noreferrer"
                className={columnLink}
              >
                GitHub
              </a>
              <a
                href="https://discord.gg/convera"
                target="_blank"
                rel="noopener noreferrer"
                className={columnLink}
              >
                Discord
              </a>
            </nav>
          </div>

          <div>
            <p className={columnLabel}>Install</p>
            <p className="text-ink-muted mt-4 text-sm leading-relaxed">
              One command, quarantine handled:
            </p>
            <code className="bg-well border-rule mt-3 block overflow-x-auto rounded-md border px-3 py-2 font-mono text-[11px] leading-relaxed">
              brew install --cask
              <br />
              codefox-repo/codefox/convera
            </code>
          </div>
        </div>

        <div className="border-rule mt-12 flex flex-wrap items-center justify-between gap-4 border-t pt-6">
          <p className="text-ink-faint font-mono text-xs">
            © 2026 Convera. Set in Space Grotesk and JetBrains Mono.
          </p>
          <p className="text-ink-faint font-mono text-xs">macOS · beta</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
