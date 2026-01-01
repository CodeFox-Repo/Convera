export const FONT_CONFIG = {
  roboto: {
    name: "Roboto",
    source: "google",
    fallback: "sans-serif",
  },
  "fira-code": {
    name: "Fira Code",
    source: "google",
    fallback: "monospace",
  },
  "press-start-2p": {
    name: "Press Start 2P",
    source: "google",
    fallback: "monospace",
  },

  geist: {
    name: "Geist",
    source: "local",
    file: "geist/geist.ttf",
    fallback: "sans-serif",
  },
  tomorrow: {
    name: "Tomorrow",
    source: "local",
    file: "tomorrow/tomorrow-regular.ttf",
    fallback: "sans-serif",
  },
};

export const DEFAULT_FONTS = {
  sans: "roboto",
  mono: "fira-code",
  serif: "roboto",
};

export function getGoogleFontsURL() {
  const googleFonts = Object.entries(FONT_CONFIG)
    .filter(([, config]) => config.source === "google")
    .map(([, config]) => config.name.replace(/ /g, "+"));

  return `https://fonts.googleapis.com/css2?${googleFonts.map((font) => `family=${font}:wght@400;700`).join("&")}&display=swap`;
}

export function generateFontVariables() {
  const variables: Record<string, string> = {};

  Object.entries(FONT_CONFIG).forEach(([key, config]) => {
    variables[`--font-${key}`] = `"${config.name}", ${config.fallback}`;
  });

  return variables;
}
