import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Menu, X } from "lucide-react";
import React, { useState } from "react";
import LogoBrand from "./LogoBrand";
import { UserButton } from "./UserButton";

const Navbar: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const linkClass =
    "flex items-center gap-1.5 font-mono text-[13px] text-ink-muted transition-colors hover:text-ink";

  return (
    <header className="border-rule bg-paper/85 fixed top-0 left-0 z-50 w-full border-b backdrop-blur-md">
      <div className="mx-auto w-full max-w-[1180px] px-[var(--page-gutter)]">
        <div className="flex h-14 items-center justify-between">
          <div className="flex items-center gap-10">
            <LogoBrand size="md" linkable={true} />

            <nav className="hidden items-center gap-6 md:flex">
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
          </div>

          <div className="hidden items-center gap-4 md:flex">
            <span className="border-terracotta-line bg-terracotta-wash text-terracotta-soft rounded-[7px] border px-2 py-0.5 font-mono text-[11px] tracking-[0.1em] uppercase">
              beta
            </span>
            <Button size="sm" className="rounded-lg font-medium" asChild>
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

        {isMenuOpen && (
          <nav className="border-rule flex flex-col gap-1 border-t py-4 md:hidden">
            <a
              href="https://docs.foxychat.net/docs"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setIsMenuOpen(false)}
              className="text-ink-2 hover:bg-paper-2 rounded-lg px-3 py-2.5 font-mono text-[13px] transition-colors"
            >
              docs ↗
            </a>
            <Link
              to="/pricing"
              onClick={() => setIsMenuOpen(false)}
              className="text-ink-2 hover:bg-paper-2 rounded-lg px-3 py-2.5 font-mono text-[13px] transition-colors"
            >
              pricing
            </Link>
            <div className="border-rule mt-3 flex items-center gap-3 border-t px-3 pt-4">
              <Button
                size="sm"
                className="rounded-lg font-medium"
                asChild
                onClick={() => setIsMenuOpen(false)}
              >
                <Link to="/download">Download</Link>
              </Button>
              <UserButton />
            </div>
          </nav>
        )}
      </div>
    </header>
  );
};

export default Navbar;
