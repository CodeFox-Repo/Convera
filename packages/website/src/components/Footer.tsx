const Footer = () => {
  const link = "text-ink-3 underline underline-offset-4 transition-colors hover:text-ink";

  return (
    <footer className="border-rule mt-16 w-full border-t py-10">
      <div className="mx-auto w-full max-w-[1180px] px-[var(--page-gutter)]">
        <p className="text-ink-faint max-w-[72ch] font-mono text-xs leading-loose">
          <span className="text-ink-3">[convera]</span> — an AI assistant that lives on your
          desktop, not in a tab. Built with Electron, React and the Model Context Protocol.{" "}
          <
            href="https://discord.gg/convera"
            target="_blank"
            rel="noopener noreferrer"
            className={link}
          >
            discord
          </a>{" "}
          ·{" "}
          <a href="/pricing" className={link}>
            pricing
          </a>{" "}
          ·{" "}
          <a href="/download" className={link}>
            download
          </a>
          . Set in Space Grotesk and JetBrains Mono. © 2026 Convera.
        </p>
      </div>
    </footer>
  );
};

export default Footer;
