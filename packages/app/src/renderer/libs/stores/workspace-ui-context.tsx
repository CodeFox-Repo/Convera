import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * Where the user was standing, restored on reload.
 *
 * These belong together: they are one answer to "what was I looking at", and
 * scattering them across components meant each new piece of layout state
 * re-invented its own localStorage key, its own SSR guard, and its own
 * restore-on-mount effect — three of them had already drifted apart.
 *
 * Conversation selection is deliberately NOT here: it lives in the selection
 * store because non-UI code (send, relay, lifecycle) reads it too.
 */

export type WorkspaceView = "chat" | "inbox" | "agents" | "settings";
export type SidebarTab = "teams" | "chats";
export type SettingsTab = "general" | "agents" | "talent" | "org" | "mcp";

export const SIDEBAR_MIN_WIDTH = 320;
export const SIDEBAR_MAX_WIDTH = 480;

interface WorkspaceUIState {
  view: WorkspaceView;
  setView: (view: WorkspaceView) => void;
  sidebarTab: SidebarTab;
  setSidebarTab: (tab: SidebarTab) => void;
  settingsTab: SettingsTab;
  setSettingsTab: (tab: SettingsTab) => void;
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
}

const STORAGE_PREFIX = "workspace-ui:";

// Node-env tests import this module without a DOM.
const storage: Pick<Storage, "getItem" | "setItem"> | undefined =
  typeof localStorage === "undefined" ? undefined : localStorage;

function restore<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const stored = storage?.getItem(STORAGE_PREFIX + key);
  return allowed.includes(stored as T) ? (stored as T) : fallback;
}

const VIEWS = ["chat", "inbox", "agents", "settings"] as const;
const SIDEBAR_TABS = ["teams", "chats"] as const;
const SETTINGS_TABS = ["general", "agents", "talent", "org", "mcp"] as const;

const WorkspaceUIContext = createContext<WorkspaceUIState | null>(null);

export function WorkspaceUIProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [view, setView] = useState<WorkspaceView>(() =>
    restore("view", VIEWS, "chat"),
  );
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(() =>
    restore("sidebar-tab", SIDEBAR_TABS, "teams"),
  );
  const [settingsTab, setSettingsTab] = useState<SettingsTab>(() =>
    restore("settings-tab", SETTINGS_TABS, "general"),
  );
  const [sidebarWidth, setSidebarWidthState] = useState<number>(() => {
    const stored = Number(storage?.getItem(STORAGE_PREFIX + "sidebar-width"));
    return stored >= SIDEBAR_MIN_WIDTH && stored <= SIDEBAR_MAX_WIDTH
      ? stored
      : SIDEBAR_MIN_WIDTH;
  });

  useEffect(() => {
    storage?.setItem(STORAGE_PREFIX + "view", view);
  }, [view]);
  useEffect(() => {
    storage?.setItem(STORAGE_PREFIX + "sidebar-tab", sidebarTab);
  }, [sidebarTab]);
  useEffect(() => {
    storage?.setItem(STORAGE_PREFIX + "settings-tab", settingsTab);
  }, [settingsTab]);

  // Width is written on drag end rather than per frame: a resize fires this
  // dozens of times a second.
  const setSidebarWidth = useCallback((width: number) => {
    const clamped = Math.min(
      SIDEBAR_MAX_WIDTH,
      Math.max(SIDEBAR_MIN_WIDTH, width),
    );
    setSidebarWidthState(clamped);
    storage?.setItem(STORAGE_PREFIX + "sidebar-width", String(clamped));
  }, []);

  const value = useMemo(
    () => ({
      view,
      setView,
      sidebarTab,
      setSidebarTab,
      settingsTab,
      setSettingsTab,
      sidebarWidth,
      setSidebarWidth,
    }),
    [view, sidebarTab, settingsTab, sidebarWidth, setSidebarWidth],
  );

  return (
    <WorkspaceUIContext.Provider value={value}>
      {children}
    </WorkspaceUIContext.Provider>
  );
}

export function useWorkspaceUI(): WorkspaceUIState {
  const context = useContext(WorkspaceUIContext);
  if (!context) {
    throw new Error("useWorkspaceUI must be used within a WorkspaceUIProvider");
  }
  return context;
}
