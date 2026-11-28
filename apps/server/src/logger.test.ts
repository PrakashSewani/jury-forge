import { describe, expect, it } from 'vitest';
import { LogLevelError, parseLogLevel } from './logger.ts';

describe('parseLogLevel', () => {
  it('defaults to info', () => {
    expect(parseLogLevel(undefined)).toBe('info');
    expect(parseLogLevel('')).toBe('info');
  });

  it.each(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])('accepts %s', (level) => {
    expect(parseLogLevel(level)).toBe(level);
  });

  it.each(['INFO', 'verbose', 'silent', ' info'])('rejects %j', (level) => {
    expect(() => parseLogLevel(level)).toThrow(LogLevelError);
  });
});
