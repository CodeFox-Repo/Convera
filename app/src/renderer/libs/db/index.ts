/**
 * Database Module Exports
 *
 * 新架构入口：
 * - 使用 Dexie 作为本地存储
 * - 使用 useLiveQuery 实现实时数据同步
 * - 最小化 Zustand 使用（仅用于纯 UI 状态）
 */

export * from "./database";
export * from "./hooks";
export * from "./ui-state";
