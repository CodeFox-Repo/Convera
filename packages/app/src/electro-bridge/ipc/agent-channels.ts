/**
 * Shared by the main-process bridge and the preload API. Its own file so the preload
 * bundle can reach the channel names without importing anything from the Agent SDK.
 */
export const AGENT_CHANNELS = {
  SEND: "agent:send",
  STOP: "agent:stop",
  MESSAGE: "agent:message",
  APPROVAL_REQUEST: "agent:approval-request",
  APPROVAL_RESPONSE: "agent:approval-response",
} as const;
