/**
 * Error handling utilities for API errors
 */

// Standard error codes
export enum ErrorCode {
  // Authentication errors
  AUTH_MISSING_TOKEN = "AUTH_MISSING_TOKEN",
  AUTH_EMPTY_TOKEN = "AUTH_EMPTY_TOKEN",
  AUTH_NO_API_KEY = "AUTH_NO_API_KEY",
  AUTH_INVALID_KEY = "AUTH_INVALID_KEY",

  // Request validation errors
  INVALID_REQUEST = "INVALID_REQUEST",

  // Server errors
  SERVER_ERROR = "SERVER_ERROR",
  RATE_LIMIT = "RATE_LIMIT",

  // Unknown error
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

// Simple result of parsing an API error
export interface ParsedError {
  message: string;
  code: string; // Using string here to allow for custom error codes
  action?: "settings" | "retry" | "wait" | null;
}

// Generic error interface to handle various error formats
export interface GenericError {
  message?: string;
  status?: number;
  response?: {
    status: number;
    data?: {
      error?: string;
      code?: string;
      [key: string]: unknown;
    };
  };
  [key: string]: unknown;
}

/**
 * Parses an API error and returns a user-friendly message and action
 */
export function parseApiError(error: GenericError): ParsedError {
  console.error("API Error:", error);

  let message = "An unknown error occurred";
  let code: string = ErrorCode.UNKNOWN_ERROR;
  let action: "settings" | "retry" | "wait" | null = null;

  try {
    // Case 1: Error with response object (Axios/fetch style)
    if (error.response) {
      const status = error.response.status;

      // Handle by status code
      if (status === 401) {
        message =
          "Authentication failed! Please add a valid API key in settings";
        code = ErrorCode.AUTH_NO_API_KEY;
        action = "settings";
      } else if (status === 400) {
        message = "Invalid request format";
        code = ErrorCode.INVALID_REQUEST;
        action = "retry";
      } else if (status === 403) {
        message = "Permission denied, please check your API key";
        code = ErrorCode.AUTH_INVALID_KEY;
        action = "settings";
      } else if (status === 429) {
        message = "Too many requests, please try again later";
        code = ErrorCode.RATE_LIMIT;
        action = "wait";
      } else if (status >= 500) {
        message = "Server error, please try again later";
        code = ErrorCode.SERVER_ERROR;
      }

      // Try to get detailed message from response
      if (error.response.data) {
        const data = error.response.data;
        if (data.error) message = data.error;
        if (data.code) code = data.code;
      }
    }
    // Case 2: Error with status directly on error object (AI SDK style)
    else if (error.status) {
      const status = error.status;

      if (status === 401) {
        message =
          "Authentication failed! Please add a valid API key in settings";
        code = ErrorCode.AUTH_NO_API_KEY;
        action = "settings";
      } else if (status === 400) {
        message = "Invalid request format";
        code = ErrorCode.INVALID_REQUEST;
        action = "retry";
      } else if (status === 403) {
        message = "Permission denied, please check your API key";
        code = ErrorCode.AUTH_INVALID_KEY;
        action = "settings";
      } else if (status === 429) {
        message = "Too many requests, please try again later";
        code = ErrorCode.RATE_LIMIT;
        action = "wait";
      } else if (status >= 500) {
        message = "Server error, please try again later";
        code = ErrorCode.SERVER_ERROR;
      }
    }
    // Case 3: JSON string in error message
    else if (
      typeof error.message === "string" &&
      error.message.startsWith("{")
    ) {
      try {
        const errorObj = JSON.parse(error.message);
        if (errorObj.error) message = errorObj.error;

        // Check for rate limit error specifically
        if (errorObj.error === "Rate_Limit_Exceeded") {
          code = ErrorCode.RATE_LIMIT;
          action = "wait";
          // Use the detailed message if available
          if (errorObj.message) {
            message = errorObj.message;
          }
        } else if (errorObj.code) {
          code = errorObj.code;

          // Set action based on error code
          if (code.includes("AUTH") || code.includes("API_KEY")) {
            action = "settings";
          } else if (code.includes("REQUEST")) {
            action = "retry";
          } else if (code.includes("RATE") || code.includes("LIMIT")) {
            action = "wait";
          }
        }
      } catch {
        // If parsing fails, use the message directly
        message = error.message;
      }
    }
    // Case 4: Simple error with message
    else if (error.message) {
      message = error.message;
    }
  } catch {
    // If anything fails, return the generic message
  }

  return { message, code, action };
}

// Standard API error response objects
export const standardErrors = {
  authFailed: {
    status: "error",
    error: "Authentication failed! Please add a valid API key in settings",
    code: ErrorCode.AUTH_NO_API_KEY,
  },

  invalidRequest: {
    status: "error",
    error: "Invalid request format",
    code: ErrorCode.INVALID_REQUEST,
  },

  emptyMessage: {
    status: "error",
    error: "Message cannot be empty",
    code: ErrorCode.INVALID_REQUEST,
  },

  serverError: {
    status: "error",
    error: "Server error occurred",
    code: ErrorCode.SERVER_ERROR,
  },
};
