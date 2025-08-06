import React from "react";

interface SimpleBackgroundProps {
  className?: string;
}

const SimpleBackground: React.FC<SimpleBackgroundProps> = ({ className = "" }) => {
  return (
    <>
      {/* Pure black background */}
      <div
        className={`absolute inset-0 bg-black ${className}`}
      ></div>

      {/* Subtle warm overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-orange-950/15 via-transparent to-amber-950/15"></div>
    </>
  );
};

export default SimpleBackground;