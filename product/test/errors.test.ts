import { describe, expect, it } from 'vitest';
import {
  API_ERROR_CODES,
  API_ERROR_MESSAGES,
  ApiErrorCodeSchema,
  message,
  type ApiErrorCode,
} from '@jury-forge/shared';

describe('API_ERROR_CODES', () => {
  it('has a non-empty human sentence for every code', () => {
    for (const code of API_ERROR_CODES) {
      const sentence = API_ERROR_MESSAGES[code];
      expect(typeof sentence).toBe('string');
      expect(sentence.trim().length).toBeGreaterThan(0);
      expect(sentence).not.toBe(code);
    }
  });

  it('uses a distinct sentence for every code', () => {
    const sentences = API_ERROR_CODES.map((code) => API_ERROR_MESSAGES[code]);
    expect(new Set(sentences).size).toBe(sentences.length);
  });
});

describe('message', () => {
  it('maps every known code to its sentence and never echoes the code', () => {
    for (const code of API_ERROR_CODES) {
      const result = message(code);
      expect(result).toBe(API_ERROR_MESSAGES[code]);
      expect(result).not.toBe(code);
      expect(result).not.toContain(code);
    }
  });

  it('returns the fallback for an unknown code', () => {
    expect(message('definitely_not_a_code', 'fallback sentence')).toBe('fallback sentence');
  });

  it('returns the request_failed sentence when there is no fallback', () => {
    expect(message('definitely_not_a_code')).toBe(API_ERROR_MESSAGES.request_failed);
    expect(message(null)).toBe(API_ERROR_MESSAGES.request_failed);
    expect(message(undefined)).toBe(API_ERROR_MESSAGES.request_failed);
    expect(message(42 as unknown as ApiErrorCode)).toBe(API_ERROR_MESSAGES.request_failed);
  });

  it('returns the matching sentence for a known code', () => {
    expect(message('unauthorized')).toBe(API_ERROR_MESSAGES.unauthorized);
    expect(message('access_denied', 'fallback')).toBe(API_ERROR_MESSAGES.access_denied);
  });
});

describe('ApiErrorCodeSchema', () => {
  it('accepts every code in the union', () => {
    for (const code of API_ERROR_CODES) {
      expect(ApiErrorCodeSchema.safeParse(code).success).toBe(true);
    }
  });

  it('rejects a code that is not in the union', () => {
    expect(ApiErrorCodeSchema.safeParse('definitely_not_a_code').success).toBe(false);
  });
});
