import React from "react";

interface HeroBackgroundProps {
  className?: string;
}

const HeroBackground: React.FC<HeroBackgroundProps> = ({ className = "" }) => {
  return (
    <>
      {/* Dark matrix-style gradient */}
      <div
        className={`absolute inset-0 bg-gradient-to-br from-zinc-950 via-neutral-900 to-stone-950 ${className}`}
      ></div>

      {/* Warm accent gradients */}
      <div className="absolute inset-0 bg-gradient-to-tr from-orange-950/30 via-transparent to-red-950/20"></div>
      <div className="absolute inset-0 bg-gradient-to-bl from-amber-950/20 via-transparent to-yellow-950/15"></div>

      {/* Rotating energy rings */}
      <div className="absolute top-1/4 left-1/4 h-32 w-32 animate-spin rounded-full border border-orange-500/20 shadow-[0_0_30px_rgba(251,146,60,0.3)]" style={{ animationDuration: "20s" }}></div>
      <div className="absolute top-3/4 right-1/3 h-24 w-24 animate-spin rounded-full border border-red-500/15 shadow-[0_0_25px_rgba(239,68,68,0.3)]" style={{ animationDuration: "15s", animationDirection: "reverse" }}></div>
      <div className="absolute bottom-1/3 left-1/2 h-40 w-40 animate-spin rounded-full border border-amber-500/10 shadow-[0_0_35px_rgba(245,158,11,0.2)]" style={{ animationDuration: "25s" }}></div>

      {/* Floating particles - reduced */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-20 h-1 w-1 animate-bounce rounded-full bg-orange-400/40" style={{ animationDelay: "0s", animationDuration: "6s" }}></div>
        <div className="absolute bottom-20 right-20 h-1 w-1 animate-bounce rounded-full bg-red-400/40" style={{ animationDelay: "2s", animationDuration: "7s" }}></div>
        <div className="absolute top-1/2 left-1/3 h-1 w-1 animate-bounce rounded-full bg-amber-400/40" style={{ animationDelay: "4s", animationDuration: "8s" }}></div>
      </div>

      {/* Flowing light streams */}
      <div className="absolute top-0 left-1/4 h-full w-px animate-pulse bg-gradient-to-b from-transparent via-orange-500/30 to-transparent" style={{ animationDuration: "3s" }}></div>
      <div className="absolute top-0 right-1/3 h-full w-px animate-pulse bg-gradient-to-b from-transparent via-red-500/25 to-transparent" style={{ animationDelay: "1s", animationDuration: "4s" }}></div>
      <div className="absolute top-0 left-2/3 h-full w-px animate-pulse bg-gradient-to-b from-transparent via-amber-500/20 to-transparent" style={{ animationDelay: "2s", animationDuration: "3.5s" }}></div>

      {/* Enhanced morphing blobs with movement */}
      <div className="absolute top-1/3 left-1/4 h-48 w-48 animate-pulse rounded-[40%_60%_70%_30%] bg-gradient-to-r from-orange-600/15 to-red-600/15 blur-2xl" style={{ animation: "pulse 4s ease-in-out infinite, float 8s ease-in-out infinite" }}></div>
      <div
        className="absolute right-1/3 bottom-1/4 h-64 w-64 animate-pulse rounded-[60%_40%_30%_70%] bg-gradient-to-r from-amber-600/12 to-yellow-600/12 blur-3xl"
        style={{ animationDelay: "1.5s", animationDuration: "5s", animation: "pulse 5s ease-in-out infinite, float 10s ease-in-out infinite reverse" }}
      ></div>
      <div
        className="absolute top-1/2 left-1/6 h-32 w-32 animate-pulse rounded-[30%_70%_40%_60%] bg-gradient-to-r from-red-600/10 to-pink-600/10 blur-xl"
        style={{ animationDelay: "0.8s", animationDuration: "4s", animation: "pulse 4s ease-in-out infinite, float 6s ease-in-out infinite" }}
      ></div>

      {/* Orbiting elements */}
      <div className="absolute top-1/2 left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2">
        <div className="absolute h-2 w-2 animate-spin rounded-full bg-orange-400/40" style={{ animationDuration: "12s", transformOrigin: "100px 0" }}></div>
      </div>
      <div className="absolute top-1/3 right-1/4 h-1 w-1">
        <div className="absolute h-1 w-1 animate-spin rounded-full bg-red-400/40" style={{ animationDuration: "8s", transformOrigin: "80px 0", animationDirection: "reverse" }}></div>
      </div>

      {/* Glowing dots - reduced */}
      <div
        className="absolute top-1/4 left-1/4 h-2 w-2 animate-ping rounded-full bg-orange-400/60 shadow-[0_0_15px_rgba(251,146,60,0.5)]"
        style={{ animationDelay: "0s", animationDuration: "4s" }}
      ></div>
      <div
        className="absolute bottom-1/4 right-1/4 h-2 w-2 animate-ping rounded-full bg-red-400/60 shadow-[0_0_15px_rgba(239,68,68,0.5)]"
        style={{ animationDelay: "2s", animationDuration: "5s" }}
      ></div>

      {/* Animated circuit-like pattern - only on left and right edges */}
      <div className="absolute inset-0 animate-pulse bg-[linear-gradient(rgba(251,146,60,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(251,146,60,0.2)_1px,transparent_1px)] bg-[size:120px_120px] opacity-[0.03]" style={{ animationDuration: "8s", maskImage: "linear-gradient(90deg, black 0%, black 25%, transparent 25%, transparent 75%, black 75%, black 100%)", WebkitMaskImage: "linear-gradient(90deg, black 0%, black 25%, transparent 25%, transparent 75%, black 75%, black 100%)" }}></div>

      {/* Moving scanlines */}
      <div className="absolute inset-0 animate-pulse bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(251,146,60,0.1)_2px,rgba(251,146,60,0.1)_4px)] opacity-[0.02]" style={{ animationDuration: "4s" }}></div>

      {/* CSS keyframes for floating animation */}
       <style>{`
         @keyframes float {
           0%, 100% { transform: translateY(0px) translateX(0px); }
           25% { transform: translateY(-10px) translateX(5px); }
           50% { transform: translateY(-5px) translateX(-5px); }
           75% { transform: translateY(-15px) translateX(3px); }
         }
       `}</style>
    </>
  );
};

export default HeroBackground;
