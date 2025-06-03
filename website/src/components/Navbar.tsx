import React from "react";
import { Link } from "react-router-dom";
import Logo from "./Logo";

const Navbar: React.FC = () => {
  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 w-full border-b backdrop-blur">
      <div className="container flex h-16 items-center justify-between px-4 md:px-6">
        <Link to="/">
          <div className={`flex items-center`}>
            <Logo />
            <span className="text-xl font-bold">Foxychat</span>
          </div>
        </Link>
        <div className="flex items-center gap-8">
          <nav className="flex items-center gap-8">
            <a
              href="#demo"
              className="text-muted-foreground hover:text-foreground after:bg-foreground focus:ring-foreground/20 relative rounded-sm px-1 py-0.5 text-sm font-medium transition-all duration-200 after:absolute after:bottom-[-4px] after:left-0 after:h-[1px] after:w-0 after:transition-all after:duration-300 hover:after:w-full focus:ring-2 focus:ring-offset-2 focus:outline-none"
            >
              Demo
            </a>
            <a
              href="https://docs.foxychat.net/docs"
              className="text-muted-foreground hover:text-foreground after:bg-foreground focus:ring-foreground/20 relative rounded-sm px-1 py-0.5 text-sm font-medium transition-all duration-200 after:absolute after:bottom-[-4px] after:left-0 after:h-[1px] after:w-0 after:transition-all after:duration-300 hover:after:w-full focus:ring-2 focus:ring-offset-2 focus:outline-none"
            >
              Documentation
            </a>
          </nav>
          <div className="bg-foreground text-background cursor-default rounded-md px-4 py-1.5 text-xs font-medium transition-all duration-300 hover:opacity-80">
            Coming Soon
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
