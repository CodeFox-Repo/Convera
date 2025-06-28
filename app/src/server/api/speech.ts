/* eslint-disable @typescript-eslint/no-explicit-any */
import speech from "@google-cloud/speech";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const recorder = require("node-record-lpcm16");

const router = new Hono();

// Schema for speech configuration (removed apiKey as it will come from env)
const SpeechConfigSchema = z.object({
  languageCode: z.string().default("en-US"),
  alternativeLanguageCodes: z.array(z.string()).optional(),
  sampleRateHertz: z.number().default(16000),
  encoding: z.string().default("LINEAR16"),
  enableSpeakerDiarization: z.boolean().default(false),
  model: z.string().default("latest_long"),
});

// Schema for speech start request
const StartSpeechSchema = z.object({
  config: SpeechConfigSchema,
});

// Store active recording sessions
const activeSessions = new Map<
  string,
  {
    recognizeStream: any;
    audioStream: any;
    sessionId: string;
    results: string[];
    isRecording: boolean;
    interimTranscript?: string;
  }
>();

// Generate session ID
function generateSessionId(): string {
  return `speech_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Get Google Cloud API key from environment
function getGoogleCloudApiKey(): string | null {
  return process.env.GOOGLE_CLOUD_API_KEY || null;
}

// Test Google Cloud Speech authentication
async function testSpeechAuth(): Promise<boolean> {
  try {
    const apiKey = getGoogleCloudApiKey();
    if (!apiKey) {
      console.error("Google Cloud API key not found in environment variables");
      return false;
    }

    const client = new speech.SpeechClient({ apiKey });

    // Make a simple test request with minimal audio
    await client.recognize({
      config: {
        encoding: "LINEAR16",
        sampleRateHertz: 16000,
        languageCode: "en-US",
      },
      audio: {
        content: Buffer.alloc(1000), // Empty audio for test
      },
    });

    return true;
  } catch (error) {
    console.error("Speech authentication failed:", error);
    return false;
  }
}

// Start speech recognition endpoint
router.post(
  "/api/speech/start",
  // authenticateRequest,
  zValidator("json", StartSpeechSchema),
  async (c) => {
    try {
      const { config } = c.req.valid("json");

      // Check if Google Cloud API key is available
      const apiKey = getGoogleCloudApiKey();
      if (!apiKey) {
        return c.json(
          {
            status: "error",
            message:
              "Google Cloud API key not configured. Please set GOOGLE_CLOUD_API_KEY environment variable.",
          },
          500,
        );
      }

      // Test authentication first
      const authOk = await testSpeechAuth();
      if (!authOk) {
        return c.json(
          {
            status: "error",
            message:
              "Google Cloud Speech authentication failed. Please check your API key configuration.",
          },
          401,
        );
      }

      const sessionId = generateSessionId();

      // Initialize Google Cloud Speech client
      const client = new speech.SpeechClient({
        apiKey,
      });

      // Create the recognize stream
      const recognizeStream = client
        .streamingRecognize({
          config: {
            encoding: config.encoding as any,
            sampleRateHertz: config.sampleRateHertz,
            languageCode: config.languageCode,
            alternativeLanguageCodes: config.alternativeLanguageCodes,
            enableSpeakerDiarization: config.enableSpeakerDiarization,
            model: config.model,
          },
          interimResults: true,
        })
        .on("error", (error) => {
          console.error("Speech recognition error:", error);
          // Clean up session on error
          if (activeSessions.has(sessionId)) {
            const session = activeSessions.get(sessionId)!;
            session.isRecording = false;
            if (session.audioStream) {
              session.audioStream.destroy();
            }
            activeSessions.delete(sessionId);
          }
        })
        .on("data", (data) => {
          const session = activeSessions.get(sessionId);
          if (session && data.results?.[0]?.alternatives?.[0]?.transcript) {
            const transcript = data.results[0].alternatives[0].transcript;
            const isFinal = data.results[0].isFinal;
            const detectedLanguage =
              data.results[0].languageCode || config.languageCode;

            // Store both interim and final results
            if (isFinal) {
              session.results.push(transcript);
            } else {
              // Store interim result (replace previous interim)
              session.interimTranscript = transcript;
            }

            console.log(
              `Transcript (${detectedLanguage}): ${transcript} [isFinal: ${isFinal}]`,
            );
          }
        });

      // Create audio recording stream
      const audioStream = recorder
        .record({
          sampleRate: config.sampleRateHertz,
          channels: 1, // Mono audio
          audioType: "raw",
        })
        .stream();

      audioStream.on("error", (error: Error) => {
        console.error("Audio recording error:", error);
        if (activeSessions.has(sessionId)) {
          activeSessions.delete(sessionId);
        }
      });

      audioStream.on("end", () => {
        console.log("Audio stream ended for session:", sessionId);
        recognizeStream.end();
        if (activeSessions.has(sessionId)) {
          const session = activeSessions.get(sessionId)!;
          session.isRecording = false;
        }
      });

      // Store session
      activeSessions.set(sessionId, {
        recognizeStream,
        audioStream,
        sessionId,
        results: [],
        isRecording: true,
        interimTranscript: "",
      });

      // Pipe audio to recognition
      audioStream.pipe(recognizeStream);

      return c.json({
        status: "success",
        message: "Speech recognition started",
        sessionId,
        config: {
          languageCode: config.languageCode,
          sampleRateHertz: config.sampleRateHertz,
          model: config.model,
        },
      });
    } catch (error) {
      console.error("Failed to start speech recognition:", error);
      return c.json(
        {
          status: "error",
          message: "Failed to start speech recognition",
          error: error instanceof Error ? error.message : "Unknown error",
        },
        500,
      );
    }
  },
);

// Stop speech recognition endpoint
// TODO: Add authentication
router.post("/api/speech/stop/:sessionId", async (c) => {
  try {
    const sessionId = c.req.param("sessionId");
    const session = activeSessions.get(sessionId);

    if (!session) {
      return c.json(
        {
          status: "error",
          message: "Session not found or already stopped",
        },
        404,
      );
    }

    // Stop recording
    session.isRecording = false;
    if (session.audioStream) {
      session.audioStream.destroy();
    }

    // Wait a moment for final results
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Get final transcript
    const finalTranscript = session.results.join(" ").trim();

    // Clean up session
    activeSessions.delete(sessionId);

    return c.json({
      status: "success",
      message: "Speech recognition stopped",
      sessionId,
      transcript: finalTranscript,
      resultCount: session.results.length,
    });
  } catch (error) {
    console.error("Failed to stop speech recognition:", error);
    return c.json(
      {
        status: "error",
        message: "Failed to stop speech recognition",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// Get current session status
// TODO: Add authentication
router.get("/api/speech/status/:sessionId", async (c) => {
  try {
    const sessionId = c.req.param("sessionId");
    const session = activeSessions.get(sessionId);

    if (!session) {
      return c.json(
        {
          status: "error",
          message: "Session not found",
        },
        404,
      );
    }

    return c.json({
      status: "success",
      sessionId,
      isRecording: session.isRecording,
      currentResults: session.results,
      resultCount: session.results.length,
      interimTranscript: session.interimTranscript || "",
    });
  } catch (error) {
    console.error("Failed to get session status:", error);
    return c.json(
      {
        status: "error",
        message: "Failed to get session status",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// Get all active sessions
// TODO: Add authentication
router.get("/api/speech/sessions", async (c) => {
  try {
    const sessions = Array.from(activeSessions.values()).map((session) => ({
      sessionId: session.sessionId,
      isRecording: session.isRecording,
      resultCount: session.results.length,
    }));

    return c.json({
      status: "success",
      sessions,
      activeCount: sessions.filter((s) => s.isRecording).length,
      totalCount: sessions.length,
    });
  } catch (error) {
    console.error("Failed to get sessions:", error);
    return c.json(
      {
        status: "error",
        message: "Failed to get sessions",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// Health check endpoint for speech service
router.get("/api/speech/health", async (c) => {
  const apiKey = getGoogleCloudApiKey();

  return c.json({
    status: "ok",
    message: "Speech API is running",
    activeSessions: activeSessions.size,
    googleCloudConfigured: !!apiKey,
    timestamp: new Date().toISOString(),
  });
});

export default router;
