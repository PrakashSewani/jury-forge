// JSON logs with pino (technical-approach §3.12). `LOG_LEVEL` (checked by the environment schema in
// `contracts`) is `info` by default; `debug` and `trace` warn at start (operations.md §3). Headers
// that carry credentials are redacted.

import type { LogLevel } from '@jury-forge/contracts';
import pino, { type DestinationStream, type Logger } from 'pino';

/** `destination` defaults to stdout; tests pass a stream to read the lines back. */
export function createLogger(
  level: LogLevel,
  role: string,
  destination?: DestinationStream,
): Logger {
  const options = {
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
  };
  const logger = destination === undefined ? pino(options) : pino(options, destination);
  if (level === 'debug' || level === 'trace') {
    // Not `level`: that key would overwrite pino's own level field in the line.
    logger.warn(
      { logLevel: level },
      'verbose logging is on; turn it off when the investigation is done',
    );
  }
  return logger;
}
