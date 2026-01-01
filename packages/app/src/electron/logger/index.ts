/**
 * Simple Electron Logger with colors - just for console output
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",

  // Text colors
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",

  // Background colors
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
} as const;

// Color schemes for different log levels
const levelColors = {
  debug: {
    level: colors.gray,
    bracket: colors.gray,
    name: colors.cyan,
    message: colors.gray,
  },
  info: {
    level: colors.blue,
    bracket: colors.blue,
    name: colors.cyan,
    message: colors.white,
  },
  warn: {
    level: colors.yellow,
    bracket: colors.yellow,
    name: colors.cyan,
    message: colors.yellow,
  },
  error: {
    level: colors.red + colors.bright,
    bracket: colors.red,
    name: colors.cyan,
    message: colors.red,
  },
} as const;

/**
 * Format timestamp with subtle color
 */
function formatTimestamp(timestamp: string): string {
  return `${colors.gray}[${timestamp}]${colors.reset}`;
}

/**
 * Format log level with appropriate color
 */
function formatLevel(level: LogLevel): string {
  const scheme = levelColors[level];
  return `${scheme.bracket}[${scheme.level}${level.toUpperCase()}${colors.reset}${scheme.bracket}]${colors.reset}`;
}

/**
 * Format logger name with color
 */
function formatName(name: string, level: LogLevel): string {
  const scheme = levelColors[level];
  return `${scheme.bracket}[${scheme.name}${name}${colors.reset}${scheme.bracket}]${colors.reset}`;
}

/**
 * Format message with appropriate color
 */
function formatMessage(message: string, level: LogLevel): string {
  const scheme = levelColors[level];
  return `${scheme.message}${message}${colors.reset}`;
}

/**
 * Simple log function - just output to console with formatting and colors
 */
export function log(
  level: LogLevel,
  name: string,
  message: string,
  data?: unknown,
): void {
  const timestamp = new Date().toISOString();

  // Build colored output
  const parts: (string | unknown)[] = [
    formatTimestamp(timestamp),
    formatLevel(level),
    formatName(name, level),
    formatMessage(message, level),
  ];

  if (data !== undefined) {
    // Add data as separate parameter to preserve object formatting
    parts.push(data);
  }

  switch (level) {
    case "debug":
      console.debug(...parts);
      break;
    case "info":
      console.info(...parts);
      break;
    case "warn":
      console.warn(...parts);
      break;
    case "error":
      console.error(...parts);
      break;
  }
}

// Initialize function (no-op now, but keep for consistency)
export function initializeLogger(): void {
  console.log(
    `${colors.green}${colors.bright}✓ Simple Logger initialized${colors.reset}`,
  );
}

/**
 * Get a logger instance for a specific module/window
 */
export function getLogger(name: string) {
  return {
    debug: (message: string, data?: unknown) =>
      log("debug", name, message, data),
    info: (message: string, data?: unknown) => log("info", name, message, data),
    warn: (message: string, data?: unknown) => log("warn", name, message, data),
    error: (message: string, data?: unknown) =>
      log("error", name, message, data),
  };
}
