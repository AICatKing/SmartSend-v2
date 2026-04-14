export type AppErrorCode =
  | "CONFIG_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "DEPENDENCY_ERROR"
  | "INTERNAL_ERROR";

type AppErrorOptions = {
  cause?: unknown;
  details?: Record<string, unknown>;
  statusCode?: number;
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly details: Record<string, unknown> | undefined;
  readonly statusCode: number;

  constructor(code: AppErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, {
      cause: options.cause,
    });

    this.name = "AppError";
    this.code = code;
    this.details = options.details;
    this.statusCode = options.statusCode ?? inferStatusCode(code);
  }
}

export class ConfigError extends AppError {
  constructor(message: string, options: Omit<AppErrorOptions, "statusCode"> = {}) {
    super("CONFIG_ERROR", message, {
      ...options,
      statusCode: 500,
    });
  }
}

export function formatUnknownError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
  };
}

function inferStatusCode(code: AppErrorCode) {
  switch (code) {
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "VALIDATION_ERROR":
      return 400;
    case "CONFIG_ERROR":
    case "DEPENDENCY_ERROR":
    case "INTERNAL_ERROR":
      return 500;
    default: {
      const exhaustiveCheck: never = code;
      return exhaustiveCheck;
    }
  }
}
