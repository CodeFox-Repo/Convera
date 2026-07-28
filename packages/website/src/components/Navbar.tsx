import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Menu, X } from "lucide-react";
import React, { useState } from "react";
import LogoBrand from "./LogoBrand";
import { UserButton } from "./UserButton";

/* liquid-glass pill: translucent paper + blur + one soft ambient shadow */
const glass =
  "border-rule/80 border bg-paper/70 shadow-[0_12px_32px_-16px_rgba(20,20,19,0.28)] backdrop-blur-xl";

const Navbar: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const linkClass =
    "flex items-center gap-1.5 font-mono text-[13px] text-ink-muted transition-colors hover:text-ink";

  return (
    <header className="fixed top-4 left-0 z-50 w-full px-[var(--page-gutter)]">
      <div className="mx-auto flex w-full max-w-[1180px] justify-center">
        <div className={`flex items-center gap-6 rounded-full py-2 pr-2 pl-5 ${glass}`}>
          <LogoBrand size="md" linkable={true} />

          <nav className="hidden items-center gap-5 md:flex">
            <a
              href="https://docs.foxychat.net/docs"
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
            >
              docs
              <ExternalLink className="h-3 w-3 opacity-60" />
            </a>
            <Link to="/pricing" className={linkClass}>
              pricing
            </Link>
            <Link to="/download" className={linkClass}>
              download
            </Link>
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <span className="border-terracotta-line bg-terracotta-wash text-terracotta rounded-full border px-2.5 py-0.5 font-mono text-[11px] tracking-[0.1em] uppercase">
              beta
            </span>
            <Button size="sm" className="rounded-full px-4 font-medium" asChild>
              <Link to="/download">Download</Link>
            </Button>
            <UserButton />
          </div>

          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="text-ink-muted hover:text-ink p-2 transition-colors md:hidden"
            aria-label="Toggle menu"
          >
            {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {isMenuOpen && (
        <div className="mx-auto mt-2 w-full max-w-[420px]">
          <nav className={`flex flex-col gap-1 rounded-2xl p-3 ${glass}`}>
            <a
              href="https://docs.foxychat.net/docs"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setIsMenuOpen(false)}
              className="text-ink-2 hover:bg-paper-2 rounded-xl px-3 py-2.5 font-mono text-[13px] transition-colors"
            >
              docs ↗
            </a>
            <Link
              to="/pricing"
              onClick={() => setIsMenuOpen(false)}
              className="text-ink-2 hover:bg-paper-2 rounded-xl px-3 py-2.5 font-mono text-[13px] transition-colors"
            >
              pricing
            </Link>
            <div className="border-rule mt-2 flex items-center gap-3 border-t px-3 pt-3">
              <Button
                size="sm"
                className="rounded-full px-4 font-medium"
                asChild
                onClick={() => setIsMenuOpen(false)}
              >
                <Link to="/download">Download</Link>
              </Button>
              <UserButton />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
};

export default Navbar;
