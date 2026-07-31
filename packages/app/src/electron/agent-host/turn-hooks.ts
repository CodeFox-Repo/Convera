import type {
  LocalAiCompletedTurn,
  LocalAiFailedTurn,
  LocalAiTurnHookInput,
  LocalAiTurnHooks,
  PreparedLocalAiTurnContext,
} from "../ai/runtime";
import type { AgentHostRendererBridge } from "./renderer-bridge";
import {
  AGENT_HOST_SYSTEM_CONTEXT,
  createChannelAgentTools,
} from "./channel-tools";

interface CompositeToken {
  kind: "composite-agent-host-turn";
  base?: unknown;
}

function token(value: unknown): CompositeToken | undefined {
  if (
    value &&
    typeof value === "object" &&
    "kind" in value &&
    value.kind === "composite-agent-host-turn"
  ) {
    return value as CompositeToken;
  }
  return undefined;
}

export function withAgentHostTurnHooks(
  base: LocalAiTurnHooks | undefined,
  bridge: AgentHostRendererBridge,
): LocalAiTurnHooks {
  return {
    async prepareTurnContext(
      input: LocalAiTurnHookInput,
    ): Promise<PreparedLocalAiTurnContext | undefined> {
      const prepared = await base?.prepareTurnContext?.(input);
      if (!input.request.agentHost) return prepared;
      return {
        ...prepared,
        systemContext: [prepared?.systemContext, AGENT_HOST_SYSTEM_CONTEXT]
          .filter(Boolean)
          .join("\n\n"),
        additionalTools: [
          ...(prepared?.additionalTools ?? []),
          ...createChannelAgentTools({ request: input.request, bridge }),
        ],
        contextToken: {
          kind: "composite-agent-host-turn",
          base: prepared?.contextToken,
        } satisfies CompositeToken,
      };
    },
    prepareDurableTurnHook(input) {
      const composite = token(input.contextToken);
      return base?.prepareDurableTurnHook?.({
        ...input,
        contextToken: composite?.base ?? input.contextToken,
      });
    },
    replayDurableTurnHook: (hook) => base?.replayDurableTurnHook?.(hook),
    onTurnCompleted(input: LocalAiCompletedTurn) {
      const composite = token(input.contextToken);
      return base?.onTurnCompleted?.({
        ...input,
        contextToken: composite?.base ?? input.contextToken,
      });
    },
    onTurnFailed(input: LocalAiFailedTurn) {
      const composite = token(input.contextToken);
      return base?.onTurnFailed?.({
        ...input,
        contextToken: composite?.base ?? input.contextToken,
      });
    },
  };
}
