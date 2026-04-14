import pino from "pino";

type CreateLoggerOptions = {
  level?: string;
  service: string;
};

export function createLogger(options: CreateLoggerOptions) {
  return pino({
    name: options.service,
    level: options.level ?? process.env.LOG_LEVEL ?? "info",
    base: null,
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
