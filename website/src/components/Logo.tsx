import React from 'react';

interface LogoProps {
  className?: string;
}

const Logo: React.FC<LogoProps> = ({ className = '' }) => {
  return (
    <div className={`flex items-center ${className}`}>
      <svg 
        width="40" 
        height="40" 
        viewBox="0 0 40 40" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className="mr-2"
      >
        <path 
          d="M20 5C11.716 5 5 11.716 5 20C5 28.284 11.716 35 20 35C28.284 35 35 28.284 35 20C35 11.716 28.284 5 20 5Z" 
          fill="currentColor" 
          className="text-primary"
        />
        <path 
          d="M15 15C16.1046 15 17 14.1046 17 13C17 11.8954 16.1046 11 15 11C13.8954 11 13 11.8954 13 13C13 14.1046 13.8954 15 15 15Z" 
          fill="white" 
        />
        <path 
          d="M25 15C26.1046 15 27 14.1046 27 13C27 11.8954 26.1046 11 25 11C23.8954 11 23 11.8954 23 13C23 14.1046 23.8954 15 25 15Z" 
          fill="white" 
        />
        <path 
          d="M27.5 22C27.5 25.5899 24.0899 28.5 20 28.5C15.9101 28.5 12.5 25.5899 12.5 22" 
          stroke="white" 
          strokeWidth="2" 
          strokeLinecap="round"
        />
        <path 
          d="M32 14L36 10" 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeLinecap="round" 
          className="text-primary"
        />
        <path 
          d="M8 14L4 10" 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeLinecap="round" 
          className="text-primary"
        />
      </svg>
      <span className="font-bold text-xl">Foxyfox</span>
    </div>
  );
};

export default Logo; 