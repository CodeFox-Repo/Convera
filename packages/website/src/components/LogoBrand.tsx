import React from "react";
import { Link } from "@tanstack/react-router";
import Logo from "./Logo";

interface LogoBrandProps {
  showStatus?: boolean;
  showVersion?: boolean;
  showCursor?: boolean;
  size?: "sm" | "md" | "lg";
  linkable?: boolean;
  className?: string;
}

const sizes = {
  sm: { text: "text-base", logo: 22 },
  md: { text: "text-lg", logo: 26 },
  lg: { text: "text-xl", logo: 32 },
};

const LogoBrand: React.FC<LogoBrandProps> = ({
  showCursor = true,
  size = "md",
  linkable = true,
  className = "",
}) => {
  const s = sizes[size];

  const content = (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <Logo width={s.logo} height={s.logo} />
      <span className={`text-ink font-mono font-medium tracking-tight ${s.text}`}>
        convera{showCursor && <span className="caret">▮</span>}
      </span>
    </span>
  );

  if (linkable) {
    return <Link to="/">{content}</Link>;
  }
  return content;
};

export default LogoBrand;
