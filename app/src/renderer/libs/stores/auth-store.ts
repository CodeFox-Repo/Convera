import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

// Authentication state interface
interface AuthState {
  isLoggedIn: boolean;
  sessionId: string | null;
  lastSyncTime: number;
}

// Authentication actions interface
interface AuthActions {
  setAuthState: (authState: {
    isLoggedIn: boolean;
    sessionId?: string;
  }) => void;
}

type AuthStore = AuthState & AuthActions;

// Initial state
const initialState: AuthState = {
  isLoggedIn: false,
  sessionId: null,
  lastSyncTime: Date.now(),
};

// Load state
const loadAuthStateFromElectronStore = (): Partial<AuthState> => {
  try {
    const storedAuthState = localStorage.getItem("foxchat_auth_state");
    if (storedAuthState) {
      const authState = JSON.parse(storedAuthState);
      // Check if the stored state is recent (within 5 minutes)
      const stateAge = Date.now() - new Date(authState.timestamp).getTime();
      if (stateAge < 5 * 60 * 1000) {
        return {
          isLoggedIn: authState.isLoggedIn || false,
          sessionId: authState.sessionId || null,
          lastSyncTime: authState.timestamp || Date.now(),
        };
      }
    }
  } catch (error) {
    console.error("Failed to load auth state from localStorage:", error);
  }
  return {};
};

// Save state to electron-store
const saveAuthStateToElectronStore = (state: AuthState) => {
  // Fallback to localStorage in non-Electron environments
  try {
    const authStateToSave = {
      isLoggedIn: state.isLoggedIn,
      sessionId: state.sessionId,
      timestamp: state.lastSyncTime,
    };
    localStorage.setItem("foxchat_auth_state", JSON.stringify(authStateToSave));

    // Trigger storage event for cross-window sync in browser
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "foxchat_auth_state",
          newValue: JSON.stringify(authStateToSave),
          storageArea: localStorage,
        }),
      );
    }
  } catch (error) {
    console.error("Failed to save auth state to localStorage:", error);
  }
  return;
};

// Create Zustand store
export const useAuthStore = create<AuthStore>()(
  subscribeWithSelector((set) => ({
    // Initial state (merged with loaded state)
    ...initialState,
    ...loadAuthStateFromElectronStore(),

    // Actions
    setAuthState: (authState: { isLoggedIn: boolean; sessionId?: string }) => {
      set({
        isLoggedIn: authState.isLoggedIn,
        sessionId: authState.sessionId || null,
        lastSyncTime: Date.now(),
      });
    },
  })),
);

// Monitor state changes and auto-save
// In browser environment, use localStorage + storage events
useAuthStore.subscribe((state: AuthStore) => {
  saveAuthStateToElectronStore(state);
});

// Listen for storage events (cross-window sync in browser)
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === "foxchat_auth_state" && event.newValue) {
      try {
        const authState = JSON.parse(event.newValue);
        const currentState = useAuthStore.getState();

        // Only sync if remote state is newer
        if (
          authState.timestamp &&
          authState.timestamp > currentState.lastSyncTime
        ) {
          useAuthStore.setState({
            isLoggedIn: authState.isLoggedIn || false,
            sessionId: authState.sessionId || null,
            lastSyncTime: authState.timestamp || Date.now(),
          });
        }
      } catch (error) {
        console.error("Failed to parse auth state from storage event:", error);
      }
    }
  });
}

// Export selector hooks for convenience
export const useIsLoggedIn = () => useAuthStore((state) => state.isLoggedIn);

// Memoized actions selector to prevent infinite re-renders
// Individual action selectors to avoid object recreation
export const useSetAuthState = () =>
  useAuthStore((state) => state.setAuthState);
