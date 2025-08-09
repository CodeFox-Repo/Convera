import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { Download, ExternalLink, FileText, Menu, X } from "lucide-react";
import React, { useState } from "react";
import LogoBrand from "./LogoBrand";
import { UserButton } from "./UserButton";

const Navbar: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <header className="fixed top-4 left-1/2 z-50 w-full -translate-x-1/2">
      <div className="container mx-auto max-w-7xl rounded-full border border-orange-900/40 bg-zinc-950/80 backdrop-blur-md shadow-lg shadow-orange-900/20 transition-all duration-500 hover:bg-zinc-900/85 hover:shadow-xl hover:shadow-orange-900/30">
        <div className="flex h-16 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-x-12">
            {/* Logo Section */}
            <div className="flex items-center">
              <LogoBrand
                showStatus={true}
                showVersion={true}
                showCursor={true}
                size="md"
                linkable={true}
              />
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden items-center space-x-6 md:flex">
              <a
                href="https://docs.foxychat.net/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="group relative text-orange-100 transition-all duration-300 hover:scale-105 hover:text-amber-300"
              >
                <span className="flex items-center space-x-1 text-base font-medium">
                  <FileText className="h-4 w-4" />
                  <span>Documentation</span>
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </span>
                <div className="absolute -bottom-1 left-0 h-0.5 w-0 bg-gradient-to-r from-amber-400 to-yellow-400 transition-all duration-300 group-hover:w-full"></div>
              </a>

              <Link
                to="/pricing"
                className="group relative text-orange-100 transition-all duration-300 hover:scale-105 hover:text-red-300"
              >
                <span className="flex items-center space-x-1 text-base font-medium">
                  <span>Pricing</span>
                </span>
                <div className="absolute -bottom-1 left-0 h-0.5 w-0 bg-gradient-to-r from-red-400 to-pink-400 transition-all duration-300 group-hover:w-full"></div>
              </Link>
            </nav>
          </div>

          {/* CTA Buttons */}
          <div className="hidden items-center justify-end space-x-4 md:flex">
            <Badge
              variant="outline"
              className="border-orange-400/50 bg-gradient-to-r from-orange-950/80 to-red-950/80 px-3 py-1 font-medium text-orange-300 shadow-[0_0_10px_rgba(251,146,60,0.3)]"
            >
              Beta
            </Badge>

            <Button
              variant="outline"
              size="sm"
              className="border-orange-800/40 bg-black/20 text-orange-400/80 transition-all duration-300 hover:border-orange-500/80 hover:bg-gradient-to-r hover:from-orange-900/80 hover:to-red-900/80 hover:text-orange-100 hover:shadow-lg hover:shadow-orange-900/40"
              asChild
            >
              <Link to="/download">
                <Download className="mr-2 h-4 w-4" />
                Download
              </Link>
            </Button>
            <UserButton />
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={toggleMenu}
            className="rounded-lg p-2 text-orange-200 transition-all duration-300 hover:scale-105 hover:bg-orange-900/60 hover:text-orange-100 md:hidden"
            aria-label="Toggle menu"
          >
            {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="border-t border-orange-900/40 bg-zinc-950/80 backdrop-blur-md transition-all duration-300 md:hidden">
            <nav className="flex flex-col space-y-1 p-4">
              <a
                href="https://docs.foxychat.net/docs"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center space-x-2 rounded-lg px-4 py-3 text-orange-100 transition-all duration-300 hover:scale-[1.02] hover:bg-amber-900/40 hover:text-amber-300"
              >
                <FileText className="h-4 w-4" />
                <span className="font-medium">Documentation</span>
                <ExternalLink className="h-3 w-3 opacity-60" />
              </a>

              <Link
                to="/pricing"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center space-x-2 rounded-lg px-4 py-3 text-orange-100 transition-all duration-300 hover:scale-[1.02] hover:bg-red-900/40 hover:text-red-300"
              >
                <span className="font-medium">Pricing</span>
              </Link>

              <div className="mt-4 border-t border-orange-800/40 pt-4">
                <div className="mb-4 flex items-center justify-between">
                  <Badge
                    variant="outline"
                    className="border-orange-400/50 bg-gradient-to-r from-orange-950/80 to-red-950/80 px-3 py-1 font-medium text-orange-300 shadow-[0_0_10px_rgba(251,146,60,0.3)]"
                  >
                    Beta
                  </Badge>
                </div>

                <div className="space-y-2">
                  <Button
                    className="w-full bg-gradient-to-r from-orange-600 to-red-600 text-white shadow-lg shadow-orange-900/40 hover:from-orange-700 hover:to-red-700 hover:shadow-xl hover:shadow-orange-900/50"
                    asChild
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <Link to="/download">
                      <Download className="mr-2 h-4 w-4" />
                      Download Foxychat
                    </Link>
                  </Button>

                  <div className="flex justify-center">
                    <UserButton />
                  </div>
                </div>
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
};

export default Navbar;
