import pino from "pino";

const getLogLevel = (): string => {
  if (process.env.NODE_ENV === "production") return "info";
  if (process.env.NODE_ENV === "test") return "silent";
  return "debug";
};

export const logger = pino({
  level: getLogLevel(),
  formatters: {
    level: (label) => ({ level: label }),
    bindings: (bindings) => ({
      pid: bindings.pid,
      service: "mitable-backend",
      environment: process.env.NODE_ENV || "development",
    }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "body.password",
      "body.token",
      "body.apiKey",
      "*.screenshot",
      "*.dataUrl",
      "*.accessToken",
      "*.refreshToken",
    ],
    censor: "[REDACTED]",
  },
});

export const createLogger = (context: Record<string, unknown>) => logger.child(context);
