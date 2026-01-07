import { useEffect } from "react";

interface KeyboardShortcutOptions {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  callback: () => void;
  enabled?: boolean;
}

/**
 * Hook to register a keyboard shortcut
 * Handles platform differences (Cmd on Mac, Ctrl on Windows/Linux)
 */
export function useKeyboardShortcut({
  key,
  metaKey = false,
  ctrlKey = false,
  shiftKey = false,
  altKey = false,
  callback,
  enabled = true,
}: KeyboardShortcutOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handler = (event: KeyboardEvent) => {
      // Detect platform
      const isMac =
        typeof navigator !== "undefined" &&
        navigator.platform.toUpperCase().indexOf("MAC") >= 0;

      // On Mac, metaKey is Cmd; on Windows/Linux, use Ctrl for metaKey shortcuts
      const modifierMatch = isMac
        ? event.metaKey === metaKey && event.ctrlKey === ctrlKey
        : event.ctrlKey === (metaKey || ctrlKey) && event.metaKey === false;

      if (
        event.key.toLowerCase() === key.toLowerCase() &&
        modifierMatch &&
        event.shiftKey === shiftKey &&
        event.altKey === altKey
      ) {
        event.preventDefault();
        callback();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [key, metaKey, ctrlKey, shiftKey, altKey, callback, enabled]);
}
