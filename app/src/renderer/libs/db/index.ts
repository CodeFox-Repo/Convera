/**
 * Database Module Exports
 *
 * New architecture entry point:
 * - Uses Dexie for local storage
 * - Uses useLiveQuery for real-time data sync
 * - Minimal Zustand usage (only for pure UI state)
 */

export * from "./database";
export * from "./hooks";
export * from "./ui-state";
