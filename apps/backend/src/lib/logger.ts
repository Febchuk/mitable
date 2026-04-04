import pino from "pino";
import pretty from "pino-pretty";
import { Writable } from "node:stream";
import { appendDevLogLine } from "./dev-log-buffer.js";

const getLogLevel = (): pino.Level | string => {
  if (process.env.NODE_ENV === "production") return "info";
  if (process.env.NODE_ENV === "test") return "silent";
  return "debug";
};

const basePinoOptions: pino.LoggerOptions = {
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
};

function buildLogger(): pino.Logger {
  if (process.env.NODE_ENV === "test" || process.env.NODE_ENV === "production") {
    return pino(basePinoOptions);
  }

  // development: tee raw JSON to an in-memory buffer (feedback) and pretty-print to stdout
  const level = getLogLevel() as pino.Level;
  const captureStream = new Writable({
    write(chunk, _encoding, callback) {
      const text = chunk.toString();
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (trimmed) appendDevLogLine(trimmed);
      }
      callback();
    },
  });

  const prettyStream = pretty({ colorize: true });
  prettyStream.pipe(process.stdout);

  return pino(
    basePinoOptions,
    pino.multistream([
      { level, stream: captureStream },
      { level, stream: prettyStream },
    ])
  );
}

export const logger = buildLogger();
export const createLogger = (context: Record<string, unknown>) => logger.child(context);
