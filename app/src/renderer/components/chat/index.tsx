// app/src/renderer/components/chat/index.tsx
import { WINDOW_SIZE_PRESETS } from "@/electron/windows/window-size";
import { useThemeSync } from "@/renderer/libs/hooks/use-theme-sync";
import { useWindowClose } from "@/renderer/libs/hooks/use-window-close";
import { useChatContext } from "@/renderer/libs/stores/chat-store";
import { useChatUIStore } from "@/renderer/libs/stores/chat-ui-store";
import React, { useCallback, useEffect, useRef, useState } from "react";
import CompactChatView from "./core/compact-chat-view";
import ExpandedChatView from "./core/expanded-chat-view";
import { ChatInputRef } from "./input/chat-input";

export default function Chat() {
  const chatInputRef = useRef<ChatInputRef>(null);
  const { messages, setCopiedContent } = useChatContext();
  const { viewMode, setViewMode, hasExpandedOnce, setHasExpandedOnce } =
    useChatUIStore();

  const [initializing, setInitializing] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Helper function to create clipboard content with deduplication
  const createClipboardContent = useCallback((content: { text?: string; imageData?: string }) => {
    const timestamp = Date.now();
    return {
      ...content,
      timestamp,
      source: 'shortcut' as const
    };
  }, []);

  // Listen for theme changes from settings
  useThemeSync();

  // Handle Command+W for chat window deactivation
  useWindowClose({ type: "close" });

  useEffect(() => {
    const mountTimer = setTimeout(() => {
      setMounted(true);

      if (window.electronAPI && messages.length === 0) {
        try {
          window.electronAPI
            .getCurrentWindowSize(WINDOW_SIZE_PRESETS.COMPACT_CHAT)
            .then((res) => {
              requestAnimationFrame(() => {
                window.electronAPI.resizeWindow(res.width, res.height, true);
              });
            });
        } catch (error) {
          console.error("Chat: Error setting initial window size:", error);
        }
      }

      const initTimer = setTimeout(() => {
        setInitializing(false);
      }, 150);

      return () => clearTimeout(initTimer);
    }, 50);

    return () => {
      clearTimeout(mountTimer);
      setMounted(false);
    };
  }, [messages.length]);

  useEffect(() => {
    if (messages.length === 1 && !hasExpandedOnce && mounted && !initializing) {
      setViewMode("expanded");
    }

    if (messages.length > 0 && viewMode === "compact") {
      setViewMode("expanded");
    }
  }, [
    messages.length,
    hasExpandedOnce,
    mounted,
    initializing,
    viewMode,
    setViewMode,
  ]);

  useEffect(() => {
    if (viewMode === "expanded" && !hasExpandedOnce) {
      setHasExpandedOnce(true);

      if (typeof window !== "undefined" && window.electronAPI) {
        window.electronAPI.toggleViewMode(true);
      }
    } else if (viewMode === "compact") {
      if (typeof window !== "undefined" && window.electronAPI) {
        window.electronAPI.toggleViewMode(false);
      }
    }
  }, [viewMode, hasExpandedOnce, setHasExpandedOnce]);

  useEffect(() => {
    let mounted = true;
    
    if (window.electronAPI?.onSetInputContent) {
      const unsubscribe = window.electronAPI.onSetInputContent((content: { text?: string; imageData?: string }) => {
        // Prevent processing after unmount to avoid stale closure issues
        if (!mounted) return;
        
        // Create clipboard content with both text and image data
        if (content.imageData || (content.text && content.text.trim())) {
          const clipboardContent = createClipboardContent({
            text: content.text && content.text.trim() ? content.text : undefined,
            imageData: content.imageData || undefined
          });
          
          setCopiedContent(clipboardContent);
        } else {
          setCopiedContent(null);
        }
      });

      return () => {
        mounted = false;
        unsubscribe?.();
      };
    }
  }, [setCopiedContent, createClipboardContent]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI) {
      const removeListener = window.electronAPI.onFocusChatInput(() => {
        chatInputRef.current?.focus();
      });

      return () => {
        removeListener?.();
      };
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      chatInputRef.current?.focus();
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.classList.add("preload");

      const styleTimer = setTimeout(() => {
        document.documentElement.classList.remove("preload");
      }, 300);

      return () => clearTimeout(styleTimer);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI) {
      window.electronAPI
        .getCurrentTheme()
        .then((theme) => {
          document.documentElement.dataset.theme = theme;
        })
        .catch((err) => {
          console.error("Failed to get theme:", err);
        });
    }
  }, []);

  useEffect(() => {
    const handleSettingsUpdate = (e: CustomEvent) => {
      if (e.detail && e.detail.field === "apiKey") {
        console.log("API key updated");

        if (messages.length === 0) {
          window.location.reload();
        }
      }
    };

    window.addEventListener(
      "settings-updated",
      handleSettingsUpdate as EventListener,
    );

    return () => {
      window.removeEventListener(
        "settings-updated",
        handleSettingsUpdate as EventListener,
      );
    };
  }, [messages.length]);

  return (
    <div className="overflow-hidden h-full w-full">
      {initializing ? (
        <div className="flex h-full w-full items-center justify-center">
          <div className="animate-fade-in opacity-0 delay-100">
            <div className="bg-primary/20 h-10 w-10 animate-pulse rounded-full" />
          </div>
        </div>
      ) : messages.length > 0 ? (
        <ExpandedChatView chatInputRef={chatInputRef} />
      ) : (
        <CompactChatView chatInputRef={chatInputRef} />
      )}
    </div>
  );
}
