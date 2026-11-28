// JSON logs with pino (technical-approach §3.12). `LOG_LEVEL` is `info` by default; `debug` and
// `trace` warn at start (operations.md §3). Headers that carry credentials are redacted.

import pino, { type Logger } from 'pino';

const LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;
type Level = (typeof LEVELS)[number];

export class LogLevelError extends Error {
  override name = 'LogLevelError';
}

export function parseLogLevel(value: string | undefined): Level {
  if (value === undefined || value === '') return 'info';
  if ((LEVELS as readonly string[]).includes(value)) return value as Level;
  throw new LogLevelError(
    `LOG_LEVEL must be one of ${LEVELS.join(', ')}, got ${JSON.stringify(value)}`,
  );
}

export function createLogger(level: Level, role: string): Logger {
  const logger = pino({
    level,
    base: { role },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-hub-signature-256"]',
        'res.headers["set-cookie"]',
      ],
      censor: '[redacted]',
    },
  });
  if (level === 'debug' || level === 'trace') {
    logger.warn({ level }, 'verbose logging is on; turn it off when the investigation is done');
  }
  return logger;
}
