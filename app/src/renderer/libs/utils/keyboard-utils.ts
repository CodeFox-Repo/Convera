export interface ParsedShortcut {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

export function parseShortcut(shortcut: string): ParsedShortcut {
  const parts = shortcut.split("+").map((p) => p.trim().toLowerCase());
  const result: ParsedShortcut = { key: parts[parts.length - 1] };

  if (parts.includes("meta") || parts.includes("command") || parts.includes("cmd")) {
    result.metaKey = true;
  }
  if (parts.includes("ctrl") || parts.includes("control")) {
    result.ctrlKey = true;
  }
  if (parts.includes("alt") || parts.includes("option")) {
    result.altKey = true;
  }
  if (parts.includes("shift")) {
    result.shiftKey = true;
  }

  return result;
}

export function matchesShortcut(event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>, shortcut: string): boolean {
  const parsed = parseShortcut(shortcut);
  if (parsed.key !== event.key.toLowerCase()) return false;
  if (parsed.metaKey && !event.metaKey) return false;
  if (!parsed.metaKey && event.metaKey) return false;
  if (parsed.ctrlKey && !event.ctrlKey) return false;
  if (!parsed.ctrlKey && event.ctrlKey) return false;
  if (parsed.altKey && !event.altKey) return false;
  if (!parsed.altKey && event.altKey) return false;
  if (parsed.shiftKey && !event.shiftKey) return false;
  if (!parsed.shiftKey && event.shiftKey) return false;
  return true;
}
