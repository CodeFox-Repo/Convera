import React from 'react';

interface HeroBackgroundProps {
  className?: string;
}

const HeroBackground: React.FC<HeroBackgroundProps> = ({ className = "" }) => {
  return (
    <>
      {/* Enhanced background with gradient and patterns */}
      <div className={`absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-purple-50 ${className}`}></div>

      {/* Geometric background pattern */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-0 left-0 h-full w-full bg-[radial-gradient(circle_at_25%_25%,rgba(59,130,246,0.1)_0%,transparent_50%),radial-gradient(circle_at_75%_75%,rgba(147,51,234,0.1)_0%,transparent_50%)]"></div>
      </div>

      {/* Floating geometric shapes */}
      <div
        className="animate-float absolute top-10 left-10 h-20 w-20 rounded-lg bg-blue-200/30 blur-sm"
        style={{ animationDelay: "0s" }}
      ></div>
      <div
        className="animate-float absolute top-32 right-20 h-16 w-16 rounded-full bg-purple-200/30 blur-sm"
        style={{ animationDelay: "1s" }}
      ></div>
      <div
        className="animate-float absolute bottom-40 left-20 h-12 w-12 rounded-lg bg-indigo-200/30 blur-sm"
        style={{ animationDelay: "2s" }}
      ></div>
      <div
        className="animate-float absolute right-32 bottom-20 h-24 w-24 rounded-full bg-pink-200/30 blur-sm"
        style={{ animationDelay: "0.5s" }}
      ></div>

      {/* Rotating elements */}
      <div
        className="animate-rotate absolute top-1/4 left-1/4 h-32 w-32 rounded-full border border-blue-200/40"
        style={{ animationDuration: "25s" }}
      ></div>
      <div
        className="animate-rotate absolute right-1/4 bottom-1/3 h-40 w-40 rounded-lg border border-purple-200/40"
        style={{ animationDuration: "30s" }}
      ></div>

      {/* Enhanced animated blobs */}
      <div className="animate-pulse-slow absolute top-1/4 left-1/4 h-32 w-32 rounded-full bg-gradient-to-r from-blue-400/20 to-purple-400/20 blur-xl"></div>
      <div
        className="animate-pulse-slow absolute right-1/4 bottom-1/3 h-48 w-48 rounded-full bg-gradient-to-r from-purple-400/20 to-pink-400/20 blur-2xl"
        style={{ animationDelay: "2s" }}
      ></div>
      <div
        className="animate-pulse-slow absolute top-1/2 left-1/6 h-24 w-24 rounded-full bg-gradient-to-r from-indigo-400/15 to-blue-400/15 blur-lg"
        style={{ animationDelay: "1s" }}
      ></div>

      {/* Particle-like dots */}
      <div
        className="animate-float absolute top-20 left-1/3 h-2 w-2 rounded-full bg-blue-400/60"
        style={{ animationDelay: "0.5s" }}
      ></div>
      <div
        className="animate-float absolute top-40 right-1/3 h-1 w-1 rounded-full bg-purple-400/60"
        style={{ animationDelay: "1.5s" }}
      ></div>
      <div
        className="animate-float absolute bottom-32 left-1/2 h-3 w-3 rounded-full bg-indigo-400/60"
        style={{ animationDelay: "2.5s" }}
      ></div>
      <div
        className="animate-float absolute right-1/5 bottom-60 h-2 w-2 rounded-full bg-pink-400/60"
        style={{ animationDelay: "3s" }}
      ></div>
      <div
        className="animate-float absolute top-60 left-1/5 h-1 w-1 rounded-full bg-blue-500/60"
        style={{ animationDelay: "1.2s" }}
      ></div>

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
    </>
  );
};

export default HeroBackground;