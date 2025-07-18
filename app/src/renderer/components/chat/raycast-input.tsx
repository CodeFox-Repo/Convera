// app/src/renderer/components/chat/raycast-input.tsx
import React, { forwardRef } from "react";
import { cn } from "@/renderer/libs/utils/tailwind";

interface RaycastInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
  isCommandMode: boolean;
  placeholder?: string;
}

const RaycastInput = forwardRef<HTMLInputElement, RaycastInputProps>(
  ({ value, onChange, onKeyPress, isCommandMode, placeholder }, ref) => {
    return (
      <div className="relative w-full">
        <div className="relative">
          {/* Command mode indicator */}
          {isCommandMode && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-primary/60">
              <span className="text-sm font-medium">/</span>
            </div>
          )}
          
          {/* Main input */}
          <input
            ref={ref}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyPress}
            placeholder={placeholder || "Ask AI or type / for commands"}
            className={cn(
              "w-full h-12 rounded-lg border border-border/20 bg-background/50 backdrop-blur-sm",
              "text-foreground placeholder:text-muted-foreground/60",
              "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30",
              "transition-all duration-200 ease-in-out",
              "text-base leading-relaxed",
              isCommandMode ? "pl-8 pr-4" : "px-4",
              // Raycast-style glass effect
              "shadow-sm hover:shadow-md",
              "before:absolute before:inset-0 before:rounded-lg before:bg-gradient-to-r before:from-background/10 before:to-background/5 before:pointer-events-none"
            )}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        
        {/* Subtle glow effect when focused */}
        <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary/5 to-primary/10 opacity-0 transition-opacity duration-200 pointer-events-none peer-focus:opacity-100" />
      </div>
    );
  }
);

RaycastInput.displayName = "RaycastInput";

export default RaycastInput;