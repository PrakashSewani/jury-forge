import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorResponse, respond, strict } from '../worker/lib/respond';

const schema = z.object({
  name: z.string(),
  mode: z.enum(['auto', 'manual']),
});

const valid = { name: 'review', mode: 'auto' } as const;

describe('respond', () => {
  it('validates a payload and carries the status through', async () => {
    const response = respond(schema, valid, 201);
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(valid);
  });

  it('defaults to status 200', () => {
    expect(respond(schema, valid).status).toBe(200);
  });

  it('throws when a field is renamed', () => {
    expect(() => respond(schema, { label: 'x', mode: 'auto' } as never)).toThrow();
  });

  it('throws when a field is missing', () => {
    expect(() => respond(schema, { mode: 'auto' } as never)).toThrow();
  });

  it('throws when a field has the wrong type', () => {
    expect(() => respond(schema, { name: 42, mode: 'auto' } as never)).toThrow();
  });

  it('throws on a bad enum value', () => {
    expect(() => respond(schema, { name: 'x', mode: 'sometimes' } as never)).toThrow();
  });

  it('returns the original body, not the parsed copy, so unknown keys survive', async () => {
    const response = respond(schema, { ...valid, extra: true } as never);
    await expect(response.json()).resolves.toEqual({ ...valid, extra: true });
  });
});

describe('respond strictness', () => {
  it('parses in test, in dev, and when the mode is unknown or absent', () => {
    expect(strict({ MODE: 'test' })).toBe(true);
    expect(strict({ MODE: 'development', PROD: false })).toBe(true);
    expect(strict(undefined)).toBe(true);
    expect(strict({})).toBe(true);
    expect(strict()).toBe(true);
  });

  it('skips parsing only in a real production build', () => {
    expect(strict({ MODE: 'production', PROD: true })).toBe(false);
    expect(strict({ PROD: true })).toBe(false);
  });

  it('parses by default when strictness is left to the environment', () => {
    expect(() => respond(schema, { renamed: true } as never)).toThrow();
  });

  it('skips validation when strictness is off (production)', async () => {
    const response = respond(schema, { renamed: true } as never, 200, false);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ renamed: true });
  });

  it('parses when strictness is explicitly on (test/dev)', () => {
    expect(() => respond(schema, { renamed: true } as never, 200, true)).toThrow();
  });
});

describe('errorResponse', () => {
  it('returns the code as `{ error }` with the given status', async () => {
    const response = errorResponse('not_found', 404);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'not_found' });
  });
});
