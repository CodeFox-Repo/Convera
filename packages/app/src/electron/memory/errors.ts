export class MemoryError extends Error {
  constructor(
    message: string,
    readonly code:
      | "CONFIGURATION"
      | "CONFLICT"
      | "OFFLINE"
      | "VALIDATION"
      | "APPROVAL_REQUIRED"
      | "NOT_FOUND",
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "MemoryError";
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
