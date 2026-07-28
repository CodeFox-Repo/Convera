import React from "react";

interface SimpleBackgroundProps {
  className?: string;
}

const SimpleBackground: React.FC<SimpleBackgroundProps> = ({ className = "" }) => {
  return (
    <>
      <div className={`bg-paper absolute inset-0 ${className}`}></div>
      <div className="bg-grid absolute inset-0"></div>
      <div className="from-terracotta-wash absolute inset-0 bg-gradient-to-br via-transparent to-transparent"></div>
    </>
  );
};

export default SimpleBackground;
