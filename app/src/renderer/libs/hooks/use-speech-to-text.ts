import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export interface SpeechConfig {
  languageCode?: string;
  alternativeLanguageCodes?: string[];
  sampleRateHertz?: number;
  encoding?: string;
  enableSpeakerDiarization?: boolean;
  model?: string;
}

export interface SpeechSession {
  sessionId: string;
  isRecording: boolean;
  transcript: string;
  error?: string;
}

const DEFAULT_CONFIG: SpeechConfig = {
  languageCode: "en-US",
  alternativeLanguageCodes: ["cmn-Hans-CN"],
  sampleRateHertz: 16000,
  encoding: "LINEAR16",
  enableSpeakerDiarization: false,
  model: "latest_long",
};

export function useSpeechToText() {
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const currentSessionRef = useRef<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const baseURL = "http://localhost:38000";

  // Cleanup effect
  useEffect(() => {
    return () => {
      // Stop polling when component unmounts
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, []);

  // Get auth token from localStorage (same as other API calls)
  const getAuthToken = useCallback(() => {
    return localStorage.getItem("authToken") || "temporary-token";
  }, []);

  // Make authenticated API request
  const makeRequest = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const token = getAuthToken();

      const response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${token}`,
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
    [getAuthToken],
  );

  // Poll for interim results
  const startPolling = useCallback(
    (sessionId: string, onTranscript: (text: string) => void) => {
      // Clear any existing polling
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }

      pollingIntervalRef.current = setInterval(async () => {
        try {
          const response = await makeRequest(
            `${baseURL}/api/speech/status/${sessionId}`,
          );

          if (response.status === "success" && response.interimTranscript) {
            onTranscript(response.interimTranscript);
          }
        } catch (error) {
          console.error("Error polling for interim results:", error);
        }
      }, 500); // Poll every 500ms
    },
    [makeRequest, baseURL],
  );

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // Start speech recognition
  const startRecording = useCallback(
    async (
      config: SpeechConfig = {},
      onInterimResult?: (text: string) => void,
    ) => {
      try {
        setIsLoading(true);
        setError(null);
        setTranscript("");

        const requestConfig = { ...DEFAULT_CONFIG, ...config };

        const response = await makeRequest(`${baseURL}/api/speech/start`, {
          method: "POST",
          body: JSON.stringify({ config: requestConfig }),
        });

        if (response.status === "success") {
          currentSessionRef.current = response.sessionId;
          setIsRecording(true);
          toast.success("🎤 Started recording... Speak now!");

          // Start polling for interim results if callback provided
          if (onInterimResult) {
            startPolling(response.sessionId, (interimText) => {
              setTranscript(interimText);
              onInterimResult(interimText);
            });
          }

          console.log("Speech recognition started:", {
            sessionId: response.sessionId,
            config: response.config,
          });
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
    [makeRequest, baseURL, startPolling],
  );

  // Stop speech recognition and get transcript
  const stopRecording = useCallback(async (): Promise<string> => {
    if (!currentSessionRef.current) {
      throw new Error("No active recording session");
    }

    try {
      setIsLoading(true);

      // Stop polling for interim results
      stopPolling();

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
  }, [makeRequest, baseURL, stopPolling]);

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

  // Get session status
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
        message: data.message,
      };
    } catch (err) {
      console.error("Speech service health check failed:", err);
      return {
        available: false,
        googleCloudConfigured: false,
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
  }, []);

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
  };
}
