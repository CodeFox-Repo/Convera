import type { ToolDefinition } from "@/shared/types/mcp";
import type { AgentSandbox } from "@/shared/types/workspace";
import { z, type ZodRawShape, type ZodTypeAny } from "zod";
import { canonicalizeToolInputForSandbox } from "./sandbox";
import { parseToolInput } from "./tool-input";

export interface NativeMcpServer {
  transport: "stdio";
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export interface AgentToolGroup {
  serverName: string;
  tools: ToolDefinition[];
  nativeMcpServer?: NativeMcpServer;
}

export interface AgentToolInteraction {
  kind: "approval" | "input";
  name: string;
  prompt: string;
  input?: unknown;
  options?: string[];
}

export interface AgentTool {
  name: string;
  qualifiedName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  inputShape: ZodRawShape;
  inputValidator: ZodTypeAny;
  execute(input: Record<string, unknown>): Promise<unknown>;
}

export interface AgentToolCatalogOptions {
  groups: AgentToolGroup[];
  sandbox?: AgentSandbox;
  executeTool(
    serverName: string,
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<unknown>;
  requestInteraction(interaction: AgentToolInteraction): Promise<{
    approved?: boolean;
    value?: string;
  }>;
}

const BUILTIN_SERVER = "builtin";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toolSchema(tool: ToolDefinition): Record<string, unknown> {
  const schema = tool.inputSchema ?? tool.parameters;
  return isRecord(schema)
    ? schema
    : { type: "object", properties: {}, additionalProperties: true };
}

function zodForSchema(schema: unknown): ZodTypeAny {
  if (!isRecord(schema)) return z.unknown();

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    const values = schema.enum.filter(
      (value): value is string | number | boolean | null =>
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean",
    );
    if (values.length === 0) return z.unknown();
    const literals = values.map((value) => z.literal(value));
    return literals.length === 1
      ? literals[0]
      : z.union(
          literals as [
            (typeof literals)[number],
            (typeof literals)[number],
            ...(typeof literals)[number][],
          ],
        );
  }

  if (
    "const" in schema &&
    (schema.const === null ||
      typeof schema.const === "string" ||
      typeof schema.const === "number" ||
      typeof schema.const === "boolean")
  ) {
    return z.literal(schema.const);
  }

  const alternatives = Array.isArray(schema.anyOf)
    ? schema.anyOf
    : Array.isArray(schema.oneOf)
      ? schema.oneOf
      : undefined;
  if (alternatives?.length) {
    const variants = alternatives.map(zodForSchema);
    return variants.length === 1
      ? variants[0]
      : z.union(
          variants as [
            (typeof variants)[number],
            (typeof variants)[number],
            ...(typeof variants)[number][],
          ],
        );
  }

  switch (schema.type) {
    case "string": {
      let value = z.string();
      if (typeof schema.minLength === "number")
        value = value.min(schema.minLength);
      if (typeof schema.maxLength === "number")
        value = value.max(schema.maxLength);
      if (typeof schema.pattern === "string") {
        try {
          value = value.regex(new RegExp(schema.pattern));
        } catch {
          return value;
        }
      }
      if (schema.format === "uri" || schema.format === "url")
        return value.url();
      return value;
    }
    case "integer": {
      let value = z.number().int();
      if (typeof schema.minimum === "number") value = value.min(schema.minimum);
      if (typeof schema.maximum === "number") value = value.max(schema.maximum);
      return value;
    }
    case "number": {
      let value = z.number();
      if (typeof schema.minimum === "number") value = value.min(schema.minimum);
      if (typeof schema.maximum === "number") value = value.max(schema.maximum);
      return value;
    }
    case "boolean":
      return z.boolean();
    case "array": {
      let value = z.array(zodForSchema(schema.items));
      if (typeof schema.minItems === "number")
        value = value.min(schema.minItems);
      if (typeof schema.maxItems === "number")
        value = value.max(schema.maxItems);
      return value;
    }
    case "object":
      return z.object(shapeForSchema(schema)).passthrough();
    default:
      return z.unknown();
  }
}

export function shapeForSchema(schema: unknown): ZodRawShape {
  if (!isRecord(schema) || !isRecord(schema.properties)) return {};

  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter(
          (property): property is string => typeof property === "string",
        )
      : [],
  );

  return Object.fromEntries(
    Object.entries(schema.properties).map(([name, propertySchema]) => {
      const validator = zodForSchema(propertySchema);
      return [name, required.has(name) ? validator : validator.optional()];
    }),
  );
}

function slug(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase()
      .slice(0, 48) || "tool"
  );
}

function stableSuffix(value: string): string {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function requiresApproval(serverName: string, tool: ToolDefinition): boolean {
  if (serverName.toLowerCase() !== BUILTIN_SERVER) return true;
  return (
    tool.annotations?.readOnlyHint !== true ||
    tool.annotations?.openWorldHint === true
  );
}

function interactionPrompt(
  qualifiedName: string,
  input: Record<string, unknown>,
): string {
  return `Allow ${qualifiedName} to run with these arguments?\n${JSON.stringify(
    input,
    null,
    2,
  )}`;
}

function interactionOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((option) => {
    if (typeof option === "string") return [option];
    if (
      isRecord(option) &&
      typeof option.label === "string" &&
      option.label.trim()
    ) {
      return [option.label];
    }
    return [];
  });
}

export function createAgentToolCatalog(
  options: AgentToolCatalogOptions,
): AgentTool[] {
  const aliases = new Set<string>();

  return options.groups.flatMap((group) =>
    group.tools.map((definition) => {
      const qualifiedName = `${group.serverName}:${definition.name}`;
      const baseAlias = `${slug(group.serverName)}__${slug(definition.name)}`;
      const name = aliases.has(baseAlias)
        ? `${baseAlias}__${stableSuffix(qualifiedName)}`
        : baseAlias;
      aliases.add(name);

      const inputSchema = toolSchema(definition);
      const inputShape = shapeForSchema(inputSchema);
      const inputValidator = z.object(inputShape).passthrough();
      const description = [
        `Fully qualified tool: ${qualifiedName}.`,
        definition.description?.trim() || "No description provided.",
        "Returns the underlying tool result or an actionable execution error.",
      ].join(" ");

      return {
        name,
        qualifiedName,
        description,
        inputSchema,
        inputShape,
        inputValidator,
        execute: async (input: Record<string, unknown>) => {
          let parsed = parseToolInput(inputValidator, input);

          if (
            group.serverName.toLowerCase() === BUILTIN_SERVER &&
            definition.name === "ask_user_input"
          ) {
            const question =
              typeof parsed.question === "string"
                ? parsed.question
                : "What should I do next?";
            const interaction = await options.requestInteraction({
              kind: "input",
              name: qualifiedName,
              prompt: question,
              input: parsed,
              options: interactionOptions(parsed.options),
            });
            if (typeof interaction.value !== "string") {
              throw new Error(`User cancelled ${qualifiedName}.`);
            }
            return {
              success: true,
              userSelection: interaction.value,
              message: `User selected: ${interaction.value}`,
            };
          }

          if (options.sandbox) {
            parsed = canonicalizeToolInputForSandbox({
              sandbox: options.sandbox,
              serverName: group.serverName,
              definition,
              input: parsed,
            }).input;
          }

          if (requiresApproval(group.serverName, definition)) {
            const interaction = await options.requestInteraction({
              kind: "approval",
              name: qualifiedName,
              prompt: interactionPrompt(qualifiedName, parsed),
              input: parsed,
              options: ["Allow once", "Deny"],
            });
            if (interaction.approved !== true) {
              throw new Error(`User denied ${qualifiedName}.`);
            }
          }

          return options.executeTool(group.serverName, definition.name, parsed);
        },
      } satisfies AgentTool;
    }),
  );
}
