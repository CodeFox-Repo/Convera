/**
 * Library surface, for hosts that run the hands in-process instead of spawning the
 * stdio server (see the agent core in packages/app).
 *
 * Deliberately free of any agent-SDK dependency: this package knows how to drive a Mac,
 * not how to talk to a model. The host wraps `execute` in whatever tool shape it needs.
 */
export { ACTIONS, context, execute, parseKey } from "./actions";
export type { Action, ActionResult, ComputerInput } from "./actions";
export { capture, toLogical, MAX_LONG_EDGE } from "./screen";
export type { Shot } from "./screen";
export { check, frontmost, STOP_FILE } from "./guard";
