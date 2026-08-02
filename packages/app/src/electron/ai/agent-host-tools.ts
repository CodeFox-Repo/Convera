import type { AgentHost } from "@/electron/agent-host/host";
import type { AgentTool } from "./agent-tools";
import type { LocalAiTurnHooks, PreparedLocalAiTurnContext } from "./runtime";
import { z } from "zod";

const actionSchema = z.enum([
  "list",
  "inspect",
  "pause",
  "resume",
  "cancel",
  "redirect",
]);

const inputSchema = z.object({
  action: actionSchema.describe(
    "Operation to perform. Use list before acting when the user did not provide an exact task id.",
  ),
  task_id: z
    .string()
    .min(1)
    .optional()
    .describe("Stable task id returned by list. Required except for list."),
  instruction: z
    .string()
    .min(1)
    .max(4_000)
    .optional()
    .describe(
      "Replacement guidance for redirect. The new run keeps the original task identity and applies this instruction after older guidance.",
    ),
});

type Input = z.infer<typeof inputSchema>;

function jsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: actionSchema.options,
        description:
          "Use list to discover tasks, inspect for detail, pause/resume/cancel for lifecycle control, or redirect to restart with new guidance.",
      },
      task_id: {
        type: "string",
        description:
          "Stable task id returned by list. Required except for list.",
      },
      instruction: {
        type: "string",
        minLength: 1,
        maxLength: 4_000,
        description: "Required only for redirect.",
      },
    },
    required: ["action"],
    additionalProperties: false,
  };
}

function failure(code: string, message: string, recovery: string) {
  return { ok: false, error: { code, message, recovery } };
}

const CONTROL_DESCRIPTION =
  "Inspect or control this agent's background tasks while speaking privately with the user. Use list when the user refers to a task by channel, topic, or relative time. Pause, resume, cancel, and redirect change real Agent Host state; do not claim success unless the returned ok field is true. Redirect stops the current run and starts a replacement run with the supplied private guidance.";

const READ_ONLY_DESCRIPTION =
  "Look up this agent's own background tasks. Use list to see every task and inspect for one task's detail, including its run count and latest guidance. Only list and inspect work here: pause, resume, cancel, and redirect are refused outside the agent's direct conversation with the user, because lifecycle changes carry the user's private guidance and one of the listed tasks is the run currently speaking.";

function taskTool(
  host: AgentHost,
  agentMemberId: string,
  canControl: boolean,
): AgentTool {
  return {
    name: "manage_task",
    qualifiedName: "task:manage_task",
    description: canControl ? CONTROL_DESCRIPTION : READ_ONLY_DESCRIPTION,
    inputSchema: jsonSchema(),
    inputShape: inputSchema.shape,
    inputValidator: inputSchema,
    execute: async (raw) => {
      const input = inputSchema.parse(raw) as Input;
      if (
        !canControl &&
        input.action !== "list" &&
        input.action !== "inspect"
      ) {
        return failure(
          "TASK_CONTROL_UNAVAILABLE",
          `The ${input.action} action is only available in this agent's direct conversation with the user.`,
          "Use action=list or action=inspect here, and ask the user to change the task from your direct conversation.",
        );
      }
      const visible = (await host.listTasks(agentMemberId)).filter(
        (task) => task.channelKind !== "dm",
      );
      if (input.action === "list") {
        return {
          ok: true,
          truncated: visible.length > 20,
          tasks: visible.slice(0, 20).map((task) => ({
            task_id: task.id,
            channel_id: task.channelId,
            status: task.status,
            runs: task.runCount,
            updated_at: task.updatedAt,
            latest_guidance: task.controlInstructions.at(-1),
          })),
        };
      }

      if (!input.task_id) {
        return failure(
          "TASK_ID_REQUIRED",
          `The ${input.action} action requires task_id.`,
          "Call task:manage_task with action=list, choose one returned task_id, then retry.",
        );
      }
      const task = visible.find((candidate) => candidate.id === input.task_id);
      if (!task) {
        return failure(
          "TASK_NOT_FOUND",
          `Task ${input.task_id} is not a controllable task owned by this agent.`,
          "Call task:manage_task with action=list and use an exact task_id from the result.",
        );
      }
      if (input.action === "inspect") return { ok: true, task };

      if (input.action === "redirect") {
        if (!input.instruction) {
          return failure(
            "INSTRUCTION_REQUIRED",
            "Redirect requires a non-empty instruction.",
            "Retry with instruction describing what should change in the replacement run.",
          );
        }
        try {
          const job = await host.redirectTask(
            task.id,
            input.instruction,
            agentMemberId,
          );
          return {
            ok: true,
            task_id: job.taskId,
            job_id: job.id,
            status: job.status,
          };
        } catch (error) {
          return failure(
            "TASK_REDIRECT_FAILED",
            error instanceof Error ? error.message : String(error),
            "Inspect the task and retry after the current run reaches a safe boundary.",
          );
        }
      }

      const changed =
        input.action === "pause"
          ? await host.pauseTask(task.id, agentMemberId)
          : input.action === "resume"
            ? await host.resumeTask(task.id, agentMemberId)
            : await host.cancelTask(task.id, agentMemberId);
      if (!changed) {
        return failure(
          "TASK_STATE_CONFLICT",
          `Task ${task.id} cannot ${input.action} from status ${task.status}.`,
          "Inspect the task, then choose an action valid for its current status.",
        );
      }
      return { ok: true, task_id: task.id, action: input.action };
    },
  };
}

export function withAgentHostTools(
  hooks: LocalAiTurnHooks,
  getHost: () => AgentHost | undefined,
): LocalAiTurnHooks {
  return {
    ...hooks,
    prepareTurnContext: async (
      input,
    ): Promise<PreparedLocalAiTurnContext | undefined> => {
      const prepared = await hooks.prepareTurnContext?.(input);
      const memberId = input.request.agent?.memberId?.trim();
      const host = getHost();
      const channelKind = input.request.agentHost?.channelKind;
      if (!memberId || !host || !channelKind) return prepared;
      const canControl = channelKind === "dm";
      return {
        ...prepared,
        systemContext: [
          prepared?.systemContext,
          // Where they are standing, re-stated every turn. It rides here
          // rather than in the persona so that moving between rooms does not
          // read as becoming a different agent.
          input.request.agentHost?.roomContext,
          canControl
            ? "This is your private direct conversation with the user. You may inspect and control your background channel tasks with task:manage_task. Work state comes from that tool; do not guess from chat history."
            : "You may look up your own background tasks with task:manage_task (list and inspect only). Work state comes from that tool; do not guess from chat history.",
        ]
          .filter(Boolean)
          .join("\n\n"),
        additionalTools: [
          ...(prepared?.additionalTools ?? []),
          taskTool(host, memberId, canControl),
        ],
      };
    },
  };
}
