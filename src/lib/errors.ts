/**
 * Base class for custom errors in the application.
 */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    if (typeof Error.captureStackTrace === "function") {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = new Error(message).stack;
    }
  }
}

/**
 * Represents an error that can be retried.
 */
export class RetryableError extends AppError {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly details?: unknown // Using unknown instead of any
  ) {
    super(message);
  }
}

/**
 * Represents a fatal error that cannot be recovered from.
 */
export class FatalError extends AppError {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly details?: unknown // Using unknown instead of any
  ) {
    super(message);
  }
}

/**
 * Represents an error related to the upload process.
 */
export class UploadError extends AppError {
  constructor(
    message: string,
    public readonly partNumber?: number,
    public readonly uploadId?: string
  ) {
    super(message);
  }
}

/**
 * Represents an error related to the API.
 */
export class ApiError extends AppError {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody?: unknown
  ) {
    super(message);
  }
}

/**
 * Represents an error related to the database operations.
 */
export class DatabaseError extends AppError {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

/**
 * Utility function to determine if an error is retryable.
 */
export function isRetryableError(error: unknown): boolean {
  return (
    error instanceof RetryableError ||
    (error instanceof ApiError &&
      [500, 502, 503, 504].includes(error.statusCode))
  );
}
