import { cn } from "@/renderer/libs/utils/tailwind";
import React from "react";

interface BaseLogoProps {
  size?: number;
  className?: string;
}

/**
 * Base Logo component that displays the Convera logo image
 * Replaces Sparkles icon usage throughout the app
 */
export const BaseLogo: React.FC<BaseLogoProps> = ({ size = 24, className }) => {
  return (
    <img
      src="./images/logo.png"
      alt="Convera"
      width={size}
      height={size}
      className={cn("object-contain", className)}
    />
  );
};

export default BaseLogo;
