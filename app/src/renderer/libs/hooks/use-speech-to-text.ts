import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSession } from "./auth-hooks";

export interface SpeechConfig {
  languageCode?: string;
  alternativeLanguageCodes?: string[];
  sampleRateHertz?: number;
  encoding?: string;
  silenceTimeoutMs?: number; // Auto-stop recording after this many milliseconds of silence
}

export interface SpeechSession {
  sessionId: string;
  isRecording: boolean;
  transcript: string;
  error?: string;
}

const DEFAULT_CONFIG: SpeechConfig = {
  languageCode: "en-US",
  // alternativeLanguageCodes: ["en-US", "cmn-Hans-CN"],
  sampleRateHertz: 16000,
  encoding: "LINEAR16",
  silenceTimeoutMs: 5000, // Auto-stop after 5 seconds of silence
};

export function useSpeechToText() {
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Get session from better-auth
  const { data: session, isPending } = useSession();

  const currentSessionRef = useRef<string | null>(null);
  const websocketRef = useRef<WebSocket | null>(null);
  const interimCallbackRef = useRef<((text: string) => void) | null>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const silenceTimeoutMsRef = useRef<number>(DEFAULT_CONFIG.silenceTimeoutMs!);
  const baseURL = "http://localhost:3001";
  const wsURL = "ws://localhost:3001";

  // Cleanup effect
  useEffect(() => {
    return () => {
      // Close WebSocket when component unmounts
      if (websocketRef.current) {
        websocketRef.current.close();
        websocketRef.current = null;
      }
      // Clear silence timeout
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
    };
  }, []);

  // Check if user is authenticated
  const isAuthenticated = useCallback(() => {
    return !isPending && !!session?.user;
  }, [isPending, session]);

  // Start silence timeout
  const startSilenceTimeout = useCallback(() => {
    // Clear existing timeout
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
    }

    // Set new timeout
    silenceTimeoutRef.current = setTimeout(async () => {
      toast.info("⏰ Auto-stopping recording due to silence");

      // Auto-stop recording logic (inline to avoid circular dependency)
      if (!currentSessionRef.current) {
        return;
      }

      try {
        setIsLoading(true);

        // Clear this timeout since we're stopping now
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }

        // Disconnect WebSocket
        if (websocketRef.current) {
          websocketRef.current.close();
          websocketRef.current = null;
          interimCallbackRef.current = null;
        }

        const response = await fetch(
          `${baseURL}/api/speech/stop/${currentSessionRef.current}`,
          {
            method: "POST",
            credentials: "include", // Send session cookies
            headers: {
              "Content-Type": "application/json",
            },
          },
        );

        if (response.ok) {
          const data = await response.json();
          const finalTranscript = data.transcript || "";
          setTranscript(finalTranscript);
          setIsRecording(false);
          currentSessionRef.current = null;
        } else {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.message ||
              `HTTP ${response.status}: ${response.statusText}`,
          );
        }
      } catch (error) {
        console.error("Failed to auto-stop recording:", error);
        setError("Failed to auto-stop recording");
        toast.error(`❌ Failed to auto-stop recording`);
      } finally {
        setIsLoading(false);
      }
    }, silenceTimeoutMsRef.current);
  }, [baseURL]);

  // Clear silence timeout
  const clearSilenceTimeout = useCallback(() => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
  }, []);

  // Make authenticated API request using session
  const makeRequest = useCallback(
    async (url: string, options: RequestInit = {}) => {
      // Check if user is authenticated
      if (!isAuthenticated()) {
        throw new Error("User not authenticated. Please sign in.");
      }

      const response = await fetch(url, {
        ...options,
        credentials: "include", // Send session cookies automatically
        headers: {
          ...options.headers,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message ||
            `HTTP ${response.status}: ${response.statusText}`,
        );
      }

      return response.json();
    },
    [isAuthenticated],
  );

  // Connect to WebSocket for real-time updates
  const connectWebSocket = useCallback(
    (sessionId: string, onInterimResult?: (text: string) => void) => {
      // Check if user is authenticated before connecting
      if (!isAuthenticated()) {
        console.error("❌ Cannot connect to WebSocket: User not authenticated");
        setError("User not authenticated. Please sign in.");
        return null;
      }

      // Close existing connection
      if (websocketRef.current) {
        websocketRef.current.close();
      }

      const wsUrl = `${wsURL}/ws/speech?sessionId=${sessionId}`;
      console.log("🔗 Connecting to WebSocket:", wsUrl);

      // Create WebSocket with credentials for authentication
      // Note: For WebSocket authentication, cookies are automatically included for same-origin requests
      const ws = new WebSocket(wsUrl);
      websocketRef.current = ws;
      interimCallbackRef.current = onInterimResult || null;

      ws.onopen = () => {
        console.log("✅ WebSocket connected for session:", sessionId);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("📨 WebSocket message:", data);

          switch (data.type) {
            case "final":
              setTranscript(data.transcript);
              if (interimCallbackRef.current) {
                interimCallbackRef.current(data.transcript);
              }
              // Reset silence timeout when we receive speech activity
              startSilenceTimeout();
              break;

            case "status":
              setIsRecording(data.isRecording);
              if (data.interimTranscript && interimCallbackRef.current) {
                setTranscript(data.interimTranscript);
                interimCallbackRef.current(data.interimTranscript);
              }
              // Reset silence timeout when we receive speech activity
              if (data.interimTranscript) {
                startSilenceTimeout();
              }
              break;

            case "error":
              console.error("WebSocket error:", data.error);
              setError(data.error);
              toast.error(`❌ ${data.error}`);
              clearSilenceTimeout();
              break;
          }
        } catch (err) {
          console.error("Failed to parse WebSocket message:", err);
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        setError("WebSocket connection error");
      };

      ws.onclose = (event) => {
        console.log("🔌 WebSocket closed:", event.code, event.reason);

        // Handle authentication errors
        if (event.code === 1008 || event.code === 1011) {
          const authError = "Authentication failed. Please sign in again.";
          console.error("❌ WebSocket authentication error:", authError);
          setError(authError);
          toast.error(`❌ ${authError}`);
        } else if (
          event.code === 1000 &&
          event.reason === "Session ID required"
        ) {
          const sessionError = "Session ID required for WebSocket connection";
          console.error("❌ WebSocket session error:", sessionError);
          setError(sessionError);
          toast.error(`❌ ${sessionError}`);
        }

        if (websocketRef.current === ws) {
          websocketRef.current = null;
          interimCallbackRef.current = null;
        }
        // Clear silence timeout when WebSocket closes
        clearSilenceTimeout();
      };

      return ws;
    },
    [wsURL, startSilenceTimeout, clearSilenceTimeout, isAuthenticated],
  );

  // Disconnect WebSocket
  const disconnectWebSocket = useCallback(() => {
    if (websocketRef.current) {
      websocketRef.current.close();
      websocketRef.current = null;
      interimCallbackRef.current = null;
    }
  }, []);

  // Start speech recognition
  const startRecording = useCallback(
    async (
      config: SpeechConfig = {},
      onInterimResult?: (text: string) => void,
    ) => {
      try {
        // Check authentication first
        if (!isAuthenticated()) {
          throw new Error("User not authenticated. Please sign in.");
        }

        setIsLoading(true);
        setError(null);
        setTranscript("");

        const requestConfig = { ...DEFAULT_CONFIG, ...config };

        // Store timeout configuration
        silenceTimeoutMsRef.current =
          requestConfig.silenceTimeoutMs || DEFAULT_CONFIG.silenceTimeoutMs!;

        const response = await makeRequest(`${baseURL}/api/speech/start`, {
          method: "POST",
          body: JSON.stringify({ config: requestConfig }),
        });

        if (response.status === "success") {
          currentSessionRef.current = response.sessionId;
          setIsRecording(true);
          toast.success("🎤 Started recording... Speak now!");

          // Connect to WebSocket for real-time updates
          connectWebSocket(response.sessionId, onInterimResult);

          // Start silence timeout
          startSilenceTimeout();
        } else {
          throw new Error(response.message || "Failed to start recording");
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to start recording";
        setError(errorMessage);
        toast.error(`❌ ${errorMessage}`);
        console.error("Failed to start speech recognition:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [makeRequest, baseURL, connectWebSocket, startSilenceTimeout],
  );

  // Stop speech recognition and get transcript
  const stopRecording = useCallback(async (): Promise<string> => {
    if (!currentSessionRef.current) {
      throw new Error("No active recording session");
    }

    try {
      setIsLoading(true);

      // Clear silence timeout
      clearSilenceTimeout();

      // Disconnect WebSocket
      disconnectWebSocket();

      const response = await makeRequest(
        `${baseURL}/api/speech/stop/${currentSessionRef.current}`,
        { method: "POST" },
      );

      if (response.status === "success") {
        const finalTranscript = response.transcript || "";
        setTranscript(finalTranscript);
        setIsRecording(false);
        currentSessionRef.current = null;

        if (finalTranscript.trim()) {
          toast.success(
            `✅ Transcription complete: "${finalTranscript.substring(0, 50)}${finalTranscript.length > 50 ? "..." : ""}"`,
          );
        } else {
          toast.warning("🔇 No speech detected");
        }

        console.log("Speech recognition stopped:", {
          sessionId: response.sessionId,
          transcript: finalTranscript,
          resultCount: response.resultCount,
        });

        return finalTranscript;
      } else {
        throw new Error(response.message || "Failed to stop recording");
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to stop recording";
      setError(errorMessage);
      toast.error(`❌ ${errorMessage}`);
      console.error("Failed to stop speech recognition:", err);
      return "";
    } finally {
      setIsLoading(false);
    }
  }, [makeRequest, baseURL, disconnectWebSocket, clearSilenceTimeout]);

  // Toggle recording (start/stop)
  const toggleRecording = useCallback(
    async (
      config?: SpeechConfig,
      onInterimResult?: (text: string) => void,
    ): Promise<string> => {
      if (isRecording) {
        return await stopRecording();
      } else {
        await startRecording(config, onInterimResult);
        return "";
      }
    },
    [isRecording, startRecording, stopRecording],
  );

  // Get session status (keeping for compatibility)
  const getSessionStatus = useCallback(async () => {
    if (!currentSessionRef.current) {
      return null;
    }

    try {
      const response = await makeRequest(
        `${baseURL}/api/speech/status/${currentSessionRef.current}`,
      );

      if (response.status === "success") {
        return {
          sessionId: response.sessionId,
          isRecording: response.isRecording,
          currentResults: response.currentResults,
          resultCount: response.resultCount,
          connectedClients: response.connectedClients,
        };
      }
      return null;
    } catch (err) {
      console.error("Failed to get session status:", err);
      return null;
    }
  }, [makeRequest, baseURL]);

  // Check if speech service is available
  const checkServiceHealth = useCallback(async () => {
    try {
      const response = await fetch(`${baseURL}/api/speech/health`);
      const data = await response.json();

      return {
        available: response.ok && data.status === "ok",
        googleCloudConfigured: data.googleCloudConfigured,
        websocketSupported: data.websocketSupported,
        message: data.message,
      };
    } catch (err) {
      console.error("Speech service health check failed:", err);
      return {
        available: false,
        googleCloudConfigured: false,
        websocketSupported: false,
        message: "Service unavailable",
      };
    }
  }, [baseURL]);

  // Reset state
  const reset = useCallback(() => {
    setIsRecording(false);
    setIsLoading(false);
    setTranscript("");
    setError(null);
    currentSessionRef.current = null;
    clearSilenceTimeout();
    disconnectWebSocket();
  }, [clearSilenceTimeout, disconnectWebSocket]);

  return {
    // State
    isRecording,
    isLoading,
    transcript,
    error,
    sessionId: currentSessionRef.current,

    // Actions
    startRecording,
    stopRecording,
    toggleRecording,
    getSessionStatus,
    checkServiceHealth,
    reset,

    // Utils
    isAvailable: !isLoading,
    isConnected: websocketRef.current?.readyState === 1,
  };
}
