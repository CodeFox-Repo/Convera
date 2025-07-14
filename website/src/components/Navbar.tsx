import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { Download, ExternalLink, FileText, Menu, Play, X } from "lucide-react";
import React, { useState } from "react";
import Logo from "./Logo";
import { UserButton } from "./user_button";

const Navbar: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <header className="fixed top-0 z-50 w-full border-b border-gray-200/20 bg-white/80 backdrop-blur-xl supports-backdrop-filter:bg-white/60">
      <div className="container mx-auto max-w-7xl">
        <div className="flex h-16 items-center px-4 md:px-6">
          {/* Logo Section */}
          <div className="flex flex-1 items-center">
            <Link to="/" className="group flex items-center space-x-3">
              <div className="transition-transform duration-300 group-hover:scale-105">
                <Logo />
              </div>
              <span className="bg-linear-to-r from-gray-900 to-gray-600 bg-clip-text text-xl font-bold text-transparent">
                Foxychat
              </span>
            </Link>
          </div>

          {/* Desktop Navigation - Centered */}
          <nav className="hidden flex-1 items-center justify-center space-x-8 md:flex">
            <a
              href="#demo"
              className="group relative text-gray-600 transition-colors duration-300 hover:text-orange-500"
            >
              <span className="flex items-center space-x-1 text-sm font-medium">
                <Play className="h-4 w-4" />
                <span>Demo</span>
              </span>
              <div className="absolute -bottom-1 left-0 h-0.5 w-0 bg-linear-to-r from-orange-500 to-orange-400 transition-all duration-300 group-hover:w-full"></div>
            </a>

            <a
              href="https://docs.foxychat.net/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="group relative text-gray-600 transition-colors duration-300 hover:text-blue-500"
            >
              <span className="flex items-center space-x-1 text-sm font-medium">
                <FileText className="h-4 w-4" />
                <span>Documentation</span>
                <ExternalLink className="h-3 w-3 opacity-60" />
              </span>
              <div className="absolute -bottom-1 left-0 h-0.5 w-0 bg-linear-to-r from-blue-500 to-blue-400 transition-all duration-300 group-hover:w-full"></div>
            </a>

            <Link
              to="/pricing"
              className="group relative text-gray-600 transition-colors duration-300 hover:text-purple-500"
            >
              <span className="flex items-center space-x-1 text-sm font-medium">
                <span>Pricing</span>
              </span>
              <div className="absolute -bottom-1 left-0 h-0.5 w-0 bg-linear-to-r from-purple-500 to-purple-400 transition-all duration-300 group-hover:w-full"></div>
            </Link>
          </nav>

          {/* CTA Buttons */}
          <div className="hidden flex-1 items-center justify-end space-x-4 md:flex">
            <Badge
              variant="outline"
              className="border-green-200 bg-linear-to-r from-green-50 to-emerald-50 px-3 py-1 font-medium text-green-700"
            >
              Beta
            </Badge>

            <Button
              variant="outline"
              size="sm"
              className="border-gray-200 text-gray-600 transition-all duration-300 hover:bg-gray-50 hover:text-gray-800"
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
            className="rounded-lg p-2 text-gray-600 transition-colors duration-200 hover:bg-gray-100 hover:text-gray-800 md:hidden"
            aria-label="Toggle menu"
          >
            {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="border-t border-gray-200/20 bg-white/95 backdrop-blur-xl md:hidden">
            <nav className="flex flex-col space-y-1 p-4">
              <a
                href="#demo"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center space-x-2 rounded-lg px-4 py-3 text-gray-600 transition-all duration-200 hover:bg-orange-50 hover:text-orange-500"
              >
                <Play className="h-4 w-4" />
                <span className="font-medium">Demo</span>
              </a>

              <a
                href="https://docs.foxychat.net/docs"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center space-x-2 rounded-lg px-4 py-3 text-gray-600 transition-all duration-200 hover:bg-blue-50 hover:text-blue-500"
              >
                <FileText className="h-4 w-4" />
                <span className="font-medium">Documentation</span>
                <ExternalLink className="h-3 w-3 opacity-60" />
              </a>

              <Link
                to="/pricing"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center space-x-2 rounded-lg px-4 py-3 text-gray-600 transition-all duration-200 hover:bg-purple-50 hover:text-purple-500"
              >
                <span className="font-medium">Pricing</span>
              </Link>

              <div className="mt-4 border-t border-gray-200/50 pt-4">
                <div className="mb-4 flex items-center justify-between">
                  <Badge
                    variant="outline"
                    className="border-green-200 bg-linear-to-r from-green-50 to-emerald-50 px-3 py-1 font-medium text-green-700"
                  >
                    Beta
                  </Badge>
                </div>

                <Button
                  className="w-full bg-linear-to-r from-orange-500 to-orange-400 text-white shadow-lg hover:from-orange-600 hover:to-orange-500"
                  asChild
                  onClick={() => setIsMenuOpen(false)}
                >
                  <Link to="/download">
                    <Download className="mr-2 h-4 w-4" />
                    Download Foxychat
                  </Link>
                </Button>
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full"
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
