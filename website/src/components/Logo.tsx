import React from 'react';

interface LogoProps {
  className?: string;
  height?: number;
  width?: number;
}


const Logo: React.FC<LogoProps> = ({ className = '', height = 40, width = 40 }) => {
  return (
      <LogoImage height={height} width={width} />
  );
};

//LogoImage
export const LogoImage: React.FC<LogoProps> = ({ className = '', height = 40, width = 40 }) => {
  return (
    <img src="/icon.png" width={width} height={height} alt="Foxychat" className={className} />
  );
};



export default Logo; 