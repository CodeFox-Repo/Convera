import { useEffect } from "react";

/**
 * Hook to handle agent popover visibility events
 * Provides unified subscription/unsubscription for electron API events
 */
export function useAgentPopoverVisibility(onVisible: () => void) {
  useEffect(() => {
    // Setup event listener for agent popover visibility
    if (window.electronAPI?.onAgentPopoverVisible) {
      const unsubscribe = window.electronAPI.onAgentPopoverVisible(() => {
        console.log("Agent popover visible, calling callback");
        onVisible();
      });

      return unsubscribe;
    }

    console.warn("electronAPI.onAgentPopoverVisible is not available");
  }, [onVisible]);
}
