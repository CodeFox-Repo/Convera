import { useEffect } from "react";

export interface Agent {
  id: string;
  name: string;
  description: string;
  category: string;
  iconUrl?: string;
}

/**
 * Hook to handle agent selection and persistence
 */
export function useAgentSelection(
  onAgentSelect?: (agent: Agent | null) => void,
) {
  useEffect(() => {
    // Check if there's a saved agent in localStorage
    const checkForSavedAgent = () => {
      try {
        const savedAgent = localStorage.getItem("selectedAgent");
        if (savedAgent && onAgentSelect) {
          onAgentSelect(JSON.parse(savedAgent));
        }
      } catch (error) {
        console.error("Error getting saved agent:", error);
      }
    };

    // Initial check
    checkForSavedAgent();

    // Listen for custom events
    const handleAgentSelected = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (onAgentSelect && customEvent.detail && customEvent.detail.agent) {
        onAgentSelect(customEvent.detail.agent);
      }
    };

    // Listen for storage events for cross-window changes
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === "selectedAgent" && onAgentSelect) {
        if (event.newValue) {
          onAgentSelect(JSON.parse(event.newValue));
        } else {
          onAgentSelect(null);
        }
      }
    };

    // Add event listeners
    window.addEventListener("agent-selected", handleAgentSelected);
    window.addEventListener("storage", handleStorageChange);

    // Cleanup function
    return () => {
      window.removeEventListener("agent-selected", handleAgentSelected);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [onAgentSelect]);

  const handleAgentButtonClick = async (
    e: React.MouseEvent<HTMLButtonElement>,
    selectedAgent: Agent | null | undefined,
  ) => {
    const button = e.currentTarget;
    const rect = button.getBoundingClientRect();

    // Calculate global position (relative to screen)
    if (window.electronAPI) {
      e.stopPropagation();

      try {
        const { x: winX, y: winY } =
          await window.electronAPI.getCurrentWindowPosition();
        const absX = Math.round(winX + rect.left + 20);
        const absY = Math.round(winY + rect.bottom - 200);

        const width = 240;
        const height = 300;

        window.electronAPI.toggleAgentPopover(absX, absY, width, height);
      } catch (err) {
        console.error("Failed to get window position:", err);
        // Fallback to direct toggling of agent
        if (onAgentSelect) {
          onAgentSelect(selectedAgent ?? null);
        }
      }
    }
  };

  return {
    handleAgentButtonClick,
  };
}
