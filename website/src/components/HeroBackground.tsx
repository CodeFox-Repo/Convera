import React from "react";
import RetroGrid from "./RetroGrid";

interface HeroBackgroundProps {
  className?: string;
}

const HeroBackground: React.FC<HeroBackgroundProps> = ({ className = "" }) => {
  return (
    <>
      {/* Pure black background */}
      <div
        className={`absolute inset-0 bg-black ${className}`}
      ></div>

      {/* Subtle warm overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-orange-950/20 via-transparent to-amber-950/20"></div>

      {/* Dynamic Retro Grid */}
      <RetroGrid className="absolute inset-0" />
      
      {/* Soft glow at the bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-orange-950/10 to-transparent"></div>

    </>
  );
};

export default HeroBackground;
