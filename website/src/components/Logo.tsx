import React from 'react';

interface LogoProps {
  className?: string;
  height?: number;
  width?: number;
}


const Logo: React.FC<LogoProps> = ({ className = '', height = 40, width = 40 }) => {
  return (
    <div className={`flex items-center ${className}`}>
      <LogoImage height={height} width={width} />
      <span className="font-bold text-xl">Foxyfox</span>
    </div>
  );
};

//LogoImage
export const LogoImage: React.FC<LogoProps> = ({ className = '', height = 40, width = 40 }) => {
  return (
    <img src="/icon.png" width={width} height={height} alt="Foxyfox" className={className} />
  );
};



export default Logo; 