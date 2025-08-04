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

      {/* Geometric light beams */}
      <div className="absolute inset-0 opacity-40">
        <div className="absolute top-0 left-0 h-full w-full bg-[conic-gradient(from_45deg_at_25%_25%,rgba(251,146,60,0.1)_0deg,transparent_90deg),conic-gradient(from_225deg_at_75%_75%,rgba(239,68,68,0.1)_0deg,transparent_90deg)]"></div>
      </div>

      {/* Floating geometric shapes */}
      <div
        className="absolute top-20 left-20 h-8 w-8 rotate-45 animate-bounce bg-gradient-to-br from-orange-500/30 to-red-500/30 shadow-[0_0_20px_rgba(251,146,60,0.4)]"
        style={{ animationDelay: "0s", animationDuration: "3s" }}
      ></div>
      <div
        className="absolute top-32 right-32 h-6 w-6 rotate-12 animate-bounce bg-gradient-to-br from-amber-500/30 to-orange-500/30 shadow-[0_0_15px_rgba(245,158,11,0.4)]"
        style={{ animationDelay: "1s", animationDuration: "4s" }}
      ></div>
      <div
        className="absolute bottom-40 left-40 h-10 w-10 rotate-[30deg] animate-bounce bg-gradient-to-br from-red-500/30 to-pink-500/30 shadow-[0_0_25px_rgba(239,68,68,0.4)]"
        style={{ animationDelay: "2s", animationDuration: "3.5s" }}
      ></div>
      <div
        className="absolute right-24 bottom-32 h-7 w-7 rotate-[60deg] animate-bounce bg-gradient-to-br from-yellow-500/30 to-amber-500/30 shadow-[0_0_18px_rgba(234,179,8,0.4)]"
        style={{ animationDelay: "0.5s", animationDuration: "4.5s" }}
      ></div>

      {/* Sliding diagonal lines */}
      <div
        className="absolute top-1/4 left-0 h-px w-full -rotate-12 transform animate-pulse bg-gradient-to-r from-transparent via-orange-500/40 to-transparent"
        style={{ animationDuration: "3s" }}
      ></div>
      <div
        className="absolute top-1/2 left-0 h-px w-full rotate-6 transform animate-pulse bg-gradient-to-r from-transparent via-red-500/30 to-transparent"
        style={{ animationDelay: "1s", animationDuration: "4s" }}
      ></div>
      <div
        className="absolute top-3/4 left-0 h-px w-full -rotate-3 transform animate-pulse bg-gradient-to-r from-transparent via-amber-500/35 to-transparent"
        style={{ animationDelay: "2s", animationDuration: "3.5s" }}
      ></div>

      {/* Morphing blobs */}
      <div className="absolute top-1/3 left-1/4 h-48 w-48 animate-pulse rounded-[40%_60%_70%_30%] bg-gradient-to-r from-orange-600/15 to-red-600/15 blur-2xl"></div>
      <div
        className="absolute right-1/3 bottom-1/4 h-64 w-64 animate-pulse rounded-[60%_40%_30%_70%] bg-gradient-to-r from-amber-600/12 to-yellow-600/12 blur-3xl"
        style={{ animationDelay: "1.5s", animationDuration: "5s" }}
      ></div>
      <div
        className="absolute top-1/2 left-1/6 h-32 w-32 animate-pulse rounded-[30%_70%_40%_60%] bg-gradient-to-r from-red-600/10 to-pink-600/10 blur-xl"
        style={{ animationDelay: "0.8s", animationDuration: "4s" }}
      ></div>

      {/* Glowing dots */}
      <div
        className="absolute top-16 left-1/3 h-2 w-2 animate-ping rounded-full bg-orange-400 shadow-[0_0_10px_rgba(251,146,60,0.8)]"
        style={{ animationDelay: "0s", animationDuration: "2s" }}
      ></div>
      <div
        className="absolute top-56 right-1/4 h-3 w-3 animate-ping rounded-full bg-red-400 shadow-[0_0_12px_rgba(239,68,68,0.8)]"
        style={{ animationDelay: "1s", animationDuration: "2.5s" }}
      ></div>
      <div
        className="absolute bottom-24 left-1/2 h-1 w-1 animate-ping rounded-full bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.8)]"
        style={{ animationDelay: "2s", animationDuration: "3s" }}
      ></div>
      <div
        className="absolute right-1/3 bottom-48 h-2 w-2 animate-ping rounded-full bg-yellow-400 shadow-[0_0_10px_rgba(234,179,8,0.8)]"
        style={{ animationDelay: "0.7s", animationDuration: "2.2s" }}
      ></div>

      {/* Circuit-like pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(251,146,60,0.3)_1px,transparent_1px),linear-gradient(90deg,rgba(251,146,60,0.3)_1px,transparent_1px)] bg-[size:40px_40px] opacity-[0.04]"></div>

      {/* Subtle scanlines */}
      <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(251,146,60,0.1)_2px,rgba(251,146,60,0.1)_4px)] opacity-[0.02]"></div>
    </>
  );
};

export default HeroBackground;
