import type { ZodTypeAny } from "zod";

/**
 * How a model spells "I am not using this optional field".
 *
 * A schema says a field is optional; the model then declines it by sending
 * `null` at least as often as by omitting the key. Zod treats the two
 * differently — `.optional()` and `.default()` are defined in terms of the
 * property being absent — so a perfectly reasonable call fails type
 * validation and the entire tool call is rejected. The cost is not a bad
 * argument but a lost turn: the agent showed as typing and its message never
 * reached the channel.
 *
 * Normalising here rather than on each field means a schema written the
 * obvious way is correct by default, instead of correct only if whoever added
 * the field remembered `.nullish()`.
 *
 * Only `null` is dropped. An empty string is a real value to some tools —
 * writing an empty file is a legitimate thing to ask for — so whether it is
 * acceptable stays a question for the field's own schema.
 */
export function normalizeToolInput(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(normalizeToolInput);
  if (input === null || typeof input !== "object") return input;

  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (value === null) continue;
    normalized[key] = normalizeToolInput(value);
  }
  return normalized;
}

/**
 * Validates one tool call's arguments, forgiving the spellings above.
 *
 * Every tool surface parses through this, so the leniency cannot drift apart
 * between the workspace tools, the sandbox tools and MCP-backed tools.
 */
export function parseToolInput<Schema extends ZodTypeAny>(
  validator: Schema,
  input: unknown,
): ReturnType<Schema["parse"]> {
  return validator.parse(normalizeToolInput(input));
}
