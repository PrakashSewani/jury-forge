import type { SettingsResponse } from '@jury-forge/shared';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../worker';
import { createSession } from '../worker/lib/sessions';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  updateSettings,
  validateSettingsPatch,
} from '../worker/lib/settings';
import { resetInstanceState } from './db';
import { ORIGIN } from './webhook-helpers';

beforeEach(resetInstanceState);

async function session(): Promise<string> {
  const id = await createSession(env.DB, { login: 'octocat', avatarUrl: null });
  return `jf_session=${id}`;
}

describe('settings spec', () => {
  it('returns the defaults when the table is empty', async () => {
    await expect(loadSettings(env.DB)).resolves.toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.inlineCommentsPerReviewer).toBe(10);
    expect(DEFAULT_SETTINGS.inlineCommentsPerRun).toBe(25);
    expect(DEFAULT_SETTINGS.contextTotalBytes).toBe(200_000);
    expect(DEFAULT_SETTINGS.contextFileBytes).toBe(32_000);
    expect(DEFAULT_SETTINGS.descriptionLimit).toBe(4_096);
    expect(DEFAULT_SETTINGS.blockingMode).toBe(false);
    expect(DEFAULT_SETTINGS.blockingErrorThreshold).toBe(1);
  });

  it('prefers a valid stored value', async () => {
    await env.DB.prepare(
      "INSERT INTO instance_settings (key, value) VALUES ('inlineCommentsPerRun', '7'), ('blockingMode', 'true')",
    ).run();
    const settings = await loadSettings(env.DB);
    expect(settings.inlineCommentsPerRun).toBe(7);
    expect(settings.blockingMode).toBe(true);
    expect(settings.inlineCommentsPerReviewer).toBe(10);
  });

  it('falls back to the default for invalid or unparseable stored values', async () => {
    await env.DB.prepare(
      "INSERT INTO instance_settings (key, value) VALUES ('inlineCommentsPerReviewer', '500'), ('contextFileBytes', 'not-json'), ('descriptionLimit', '100')",
    ).run();
    const settings = await loadSettings(env.DB);
    expect(settings.inlineCommentsPerReviewer).toBe(10);
    expect(settings.contextFileBytes).toBe(32_000);
    expect(settings.descriptionLimit).toBe(4_096);
  });

  it('upserts provided keys and returns the effective settings', async () => {
    const updated = await updateSettings(env.DB, {
      inlineCommentsPerReviewer: 3,
      blockingMode: true,
      blockingErrorThreshold: 4,
    });
    expect(updated.inlineCommentsPerReviewer).toBe(3);
    expect(updated.blockingMode).toBe(true);
    expect(updated.blockingErrorThreshold).toBe(4);
    expect(updated.inlineCommentsPerRun).toBe(25);

    const again = await updateSettings(env.DB, { inlineCommentsPerReviewer: 5 });
    expect(again.inlineCommentsPerReviewer).toBe(5);
    expect(again.blockingMode).toBe(true);

    const rows = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM instance_settings WHERE key = 'inlineCommentsPerReviewer'",
    ).first<{ count: number }>();
    expect(rows?.count).toBe(1);
  });
});

describe('validateSettingsPatch', () => {
  it('accepts an empty object', () => {
    expect(validateSettingsPatch({})).toEqual({ ok: true, patch: {} });
  });

  it('accepts known keys with valid values', () => {
    const result = validateSettingsPatch({
      inlineCommentsPerReviewer: 1,
      blockingMode: true,
      descriptionLimit: 500,
    });
    expect(result).toEqual({
      ok: true,
      patch: { inlineCommentsPerReviewer: 1, blockingMode: true, descriptionLimit: 500 },
    });
  });

  it('rejects an unknown key', () => {
    expect(validateSettingsPatch({ nope: 1 })).toEqual({ ok: false, error: 'unknown_key' });
  });

  it('rejects a non-object', () => {
    expect(validateSettingsPatch(null).ok).toBe(false);
    expect(validateSettingsPatch([]).ok).toBe(false);
    expect(validateSettingsPatch('settings').ok).toBe(false);
    expect(validateSettingsPatch(42).ok).toBe(false);
  });

  it('rejects out-of-range, fractional, string, and null values for an integer key', () => {
    const key = 'inlineCommentsPerReviewer';
    for (const value of [0, 51, 1.5, '10', null]) {
      expect(validateSettingsPatch({ [key]: value })).toEqual({
        ok: false,
        error: 'invalid_value',
      });
    }
  });

  it('rejects a non-boolean for blockingMode', () => {
    expect(validateSettingsPatch({ blockingMode: 'true' })).toEqual({
      ok: false,
      error: 'invalid_value',
    });
  });
});

describe('settings api', () => {
  it('requires a session', async () => {
    const response = await app.request(`${ORIGIN}/api/settings`, {}, env);
    expect(response.status).toBe(401);
  });

  it('returns the defaults on GET', async () => {
    const cookie = await session();
    const response = await app.request(
      `${ORIGIN}/api/settings`,
      { headers: { Cookie: cookie } },
      env,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as SettingsResponse;
    expect(body.settings).toEqual(DEFAULT_SETTINGS);
    expect(body.defaults).toEqual(DEFAULT_SETTINGS);
  });

  it('rejects an unknown key on PATCH', async () => {
    const cookie = await session();
    const response = await app.request(
      `${ORIGIN}/api/settings`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: cookie },
        body: JSON.stringify({ nope: 1 }),
      },
      env,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'unknown_key' });
  });

  it('persists a valid partial object on PATCH', async () => {
    const cookie = await session();
    const response = await app.request(
      `${ORIGIN}/api/settings`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: cookie },
        body: JSON.stringify({ inlineCommentsPerRun: 30, blockingMode: true }),
      },
      env,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as SettingsResponse;
    expect(body.settings.inlineCommentsPerRun).toBe(30);
    expect(body.settings.blockingMode).toBe(true);
    expect(body.settings.inlineCommentsPerReviewer).toBe(10);
    expect(body.defaults).toEqual(DEFAULT_SETTINGS);

    const stored = await loadSettings(env.DB);
    expect(stored.inlineCommentsPerRun).toBe(30);
    expect(stored.blockingMode).toBe(true);
  });

  it('rejects an invalid value on PATCH', async () => {
    const cookie = await session();
    const response = await app.request(
      `${ORIGIN}/api/settings`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: cookie },
        body: JSON.stringify({ contextTotalBytes: 10 }),
      },
      env,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid_value' });
  });
});
