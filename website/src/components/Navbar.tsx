import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Download,
    ExternalLink,
    FileText,
    Menu,
    Play,
    X
} from "lucide-react";
import React, { useState } from "react";
import { Link } from "react-router-dom";
import Logo from "./Logo";

const Navbar: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <header className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-xl border-b border-gray-200/20 supports-[backdrop-filter]:bg-white/60">
      <div className="container mx-auto max-w-7xl">
        <div className="flex h-16 items-center justify-between px-4 md:px-6">
          {/* Logo Section */}
          <Link to="/" className="flex items-center space-x-3 group">
            <div className="transition-transform duration-300 group-hover:scale-105">
              <Logo />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
              Foxychat
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            <a
              href="#demo"
              className="group relative text-gray-600 hover:text-orange-500 transition-colors duration-300"
            >
              <span className="flex items-center space-x-1 text-sm font-medium">
                <Play className="h-4 w-4" />
                <span>Demo</span>
              </span>
              <div className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-orange-500 to-orange-400 transition-all duration-300 group-hover:w-full"></div>
            </a>
            
            <a
              href="https://docs.foxychat.net/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="group relative text-gray-600 hover:text-blue-500 transition-colors duration-300"
            >
              <span className="flex items-center space-x-1 text-sm font-medium">
                <FileText className="h-4 w-4" />
                <span>Documentation</span>
                <ExternalLink className="h-3 w-3 opacity-60" />
              </span>
              <div className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-300 group-hover:w-full"></div>
            </a>
          </nav>

          {/* CTA Buttons */}
          <div className="hidden md:flex items-center space-x-4">
            <Badge 
              variant="outline" 
              className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 text-green-700 px-3 py-1 font-medium"
            >
              Beta
            </Badge>
            
            <Button 
              variant="outline" 
              size="sm"
              className="border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-all duration-300"
              asChild
            >
              <Link to="/download">
                <Download className="h-4 w-4 mr-2" />
                Download
              </Link>
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={toggleMenu}
            className="md:hidden p-2 rounded-lg text-gray-600 hover:text-gray-800 hover:bg-gray-100 transition-colors duration-200"
            aria-label="Toggle menu"
          >
            {isMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden border-t border-gray-200/20 bg-white/95 backdrop-blur-xl">
            <nav className="flex flex-col space-y-1 p-4">
              <a
                href="#demo"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center space-x-2 px-4 py-3 text-gray-600 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-all duration-200"
              >
                <Play className="h-4 w-4" />
                <span className="font-medium">Demo</span>
              </a>
              
              <a
                href="https://docs.foxychat.net/docs"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center space-x-2 px-4 py-3 text-gray-600 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all duration-200"
              >
                <FileText className="h-4 w-4" />
                <span className="font-medium">Documentation</span>
                <ExternalLink className="h-3 w-3 opacity-60" />
              </a>

              <div className="pt-4 border-t border-gray-200/50 mt-4">
                <div className="flex items-center justify-between mb-4">
                  <Badge 
                    variant="outline" 
                    className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 text-green-700 px-3 py-1 font-medium"
                  >
                    Beta
                  </Badge>
                </div>
                
                <Button 
                  className="w-full bg-gradient-to-r from-orange-500 to-orange-400 hover:from-orange-600 hover:to-orange-500 text-white shadow-lg"
                  asChild
                  onClick={() => setIsMenuOpen(false)}
                >
                  <Link to="/download">
                    <Download className="h-4 w-4 mr-2" />
                    Download Foxychat
                  </Link>
                </Button>
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
};

export default Navbar;
