import {
  DEFAULT_FONTS,
  FONT_CONFIG,
  generateFontVariables,
  getGoogleFontsURL,
} from "@/renderer/config/fonts";
import { useEffect } from "react";

export function useFonts() {
  useEffect(() => {
    const googleFontsURL = getGoogleFontsURL();
    const existingLink = document.querySelector(
      `link[href*="fonts.googleapis.com"]`,
    );

    if (!existingLink && googleFontsURL.includes("family=")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = googleFontsURL;
      document.head.appendChild(link);
    }

    const variables = generateFontVariables();
    const root = document.documentElement;

    Object.entries(variables).forEach(([property, value]) => {
      root.style.setProperty(property, value);
    });

    Object.entries(DEFAULT_FONTS).forEach(([type, fontKey]) => {
      const fontConfig = FONT_CONFIG[fontKey as keyof typeof FONT_CONFIG];
      if (fontConfig) {
        root.style.setProperty(
          `--font-${type}`,
          `"${fontConfig.name}", ${fontConfig.fallback}`,
        );
      }
    });
  }, []);
}

export function setFont(type: "sans" | "mono" | "serif", fontKey: string) {
  const fontConfig = FONT_CONFIG[fontKey as keyof typeof FONT_CONFIG];
  if (fontConfig) {
    document.documentElement.style.setProperty(
      `--font-${type}`,
      `"${fontConfig.name}", ${fontConfig.fallback}`,
    );
  }
}
