import React, { createContext, useContext, useEffect, useState } from "react";

// Theme configuration
export type ThemeColor = "orange" | "pink";

export interface ThemeConfig {
  color: ThemeColor;
}

interface ThemeContextType {
  config: ThemeConfig;
  setColor: (color: ThemeColor) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Theme color definitions
const themeColors: Record<ThemeColor, Record<string, string>> = {
  orange: {
    "50": "25 100% 97%",
    "100": "24 100% 93%",
    "200": "24 100% 86%",
    "300": "24 100% 78%",
    "400": "24 100% 69%",
    "500": "24 100% 60%",
    "600": "24 100% 54%",
    "700": "22 100% 48%",
  },
  pink: {
    "50": "327 73% 97%",
    "100": "326 78% 95%",
    "200": "326 85% 90%",
    "300": "327 87% 81%",
    "400": "329 86% 70%",
    "500": "330 81% 60%",
    "600": "333 71% 51%",
    "700": "335 69% 43%",
  },
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<ThemeConfig>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("theme-config");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // fallback to default
        }
      }
    }
    return { color: "orange" as ThemeColor };
  });

  useEffect(() => {
    // Apply theme to document
    const root = document.documentElement;

    // Apply brand color CSS variables
    const brandColors = themeColors[config.color];
    Object.entries(brandColors).forEach(([shade, value]) => {
      root.style.setProperty(`--brand-${shade}`, value);
    });

    // Save to localStorage
    localStorage.setItem("theme-config", JSON.stringify(config));
  }, [config]);

  const setColor = (color: ThemeColor) => {
    setConfig((prev) => ({ ...prev, color }));
  };

  const value: ThemeContextType = {
    config,
    setColor,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

// Helper function to get theme color classes
export function getThemeColorClass(baseClass: string, shade: string = "500") {
  return baseClass.replace(/orange-\d+/, `brand-${shade}`);
}
