import React from 'react';
import Logo from "./Logo";

const Navbar: React.FC = () => {
  return (
    <header className="w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-4 md:px-6">
        <Logo />
        <div className="flex items-center gap-6">
          <nav className="flex gap-6 items-center">
            <a href="#features" className="text-sm font-medium text-muted-foreground transition-all duration-200 hover:text-foreground relative after:absolute after:left-0 after:bottom-[-4px] after:h-[2px] after:w-0 after:bg-primary after:transition-all after:duration-300 hover:after:w-full focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-2 rounded-sm px-1 py-0.5">
              Features
            </a>
            <a href="#testimonials" className="text-sm font-medium text-muted-foreground transition-all duration-200 hover:text-foreground relative after:absolute after:left-0 after:bottom-[-4px] after:h-[2px] after:w-0 after:bg-primary after:transition-all after:duration-300 hover:after:w-full focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-2 rounded-sm px-1 py-0.5">
              Testimonials
            </a>
            <a href="#faq" className="text-sm font-medium text-muted-foreground transition-all duration-200 hover:text-foreground relative after:absolute after:left-0 after:bottom-[-4px] after:h-[2px] after:w-0 after:bg-primary after:transition-all after:duration-300 hover:after:w-full focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-2 rounded-sm px-1 py-0.5">
              FAQ
            </a>
          </nav>
          <div className="bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs font-medium hover:scale-105 transition-all duration-300 cursor-default opacity-95 animate-soft-glow">
            Coming Soon
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar; 