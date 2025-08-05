import React from "react";
import { Link } from "@tanstack/react-router";
import Logo from "./Logo";

interface LogoBrandProps {
  showStatus?: boolean;
  showVersion?: boolean;
  showCursor?: boolean;
  size?: "sm" | "md" | "lg";
  linkable?: boolean;
  className?: string;
}

const LogoBrand: React.FC<LogoBrandProps> = ({
  showStatus = true,
  showVersion = true,
  showCursor = true,
  size = "md",
  linkable = true,
  className = "",
}) => {
  const sizeClasses = {
    sm: {
      container: "space-x-2",
      text: "text-lg",
      cursor: "text-base",
      logoSize: 32,
    },
    md: {
      container: "space-x-3",
      text: "text-xl",
      cursor: "text-lg",
      logoSize: 40,
    },
    lg: {
      container: "space-x-4",
      text: "text-2xl",
      cursor: "text-xl",
      logoSize: 48,
    },
  };

  const currentSize = sizeClasses[size];

  const LogoContent = () => (
    <div className={`flex items-center ${currentSize.container} ${className}`}>
      <div className="relative rounded-full transition-transform duration-300 group-hover:scale-110">
        <Logo width={currentSize.logoSize} height={currentSize.logoSize} />
        {/* Multi-layer orange glow effect for logo */}
        <div className="absolute inset-0 animate-pulse rounded-full bg-orange-primary/30 blur-sm"></div>
        <div
          className="absolute inset-0 animate-ping rounded-full bg-orange-primary/20 blur-md"
          style={{ animationDuration: "3s" }}
        ></div>
        <div
          className="absolute inset-0 animate-pulse rounded-full bg-orange-primary/10 blur-lg"
          style={{ animationDuration: "2.5s", animationDelay: "0.5s" }}
        ></div>
      </div>
      
      <div className="relative flex items-center space-x-0">
        {/* Status indicator */}
        {showStatus && (
          <div className="absolute -top-2 -left-3 flex items-center space-x-1">
            <div
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-primary"
              style={{ filter: "drop-shadow(0 0 4px var(--orange-primary))" }}
            ></div>
            <span
              className="font-mono text-[10px] text-orange-primary/70"
              style={{ filter: "drop-shadow(0 0 3px var(--orange-primary))" }}
            >
              ONLINE
            </span>
          </div>
        )}

        <span
          className={`font-black tracking-wide text-orange-primary transition-all duration-300 hover:text-orange-light ${currentSize.text}`}
          style={{
            fontFamily: "Orbitron, monospace",
            filter: "drop-shadow(0 0 8px var(--orange-primary))",
          }}
        >
          Foxychat
        </span>

        {/* Terminal cursor effect */}
        {showCursor && (
          <span
            className={`terminal-cursor ml-2 font-mono text-orange-primary ${currentSize.cursor}`}
            style={{ filter: "drop-shadow(0 0 6px var(--orange-primary))" }}
          >
            ▋
          </span>
        )}

        {/* Version indicator */}
        {showVersion && (
          <div
            className="absolute right-0 -bottom-2 animate-pulse font-mono text-[10px] text-orange-primary/50"
            style={{
              animationDuration: "3s",
              filter: "drop-shadow(0 0 3px var(--orange-primary))",
            }}
          >
            v2.0.1
          </div>
        )}
      </div>
    </div>
  );

  if (linkable) {
    return (
      <Link to="/" className="group">
        <LogoContent />
      </Link>
    );
  }

  return <LogoContent />;
};

export default LogoBrand;