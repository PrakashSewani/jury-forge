import { PRODUCT_NAME } from '@jury-forge/shared';
import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('worker', () => {
  it('serves the health endpoint', async () => {
    const response = await exports.default.fetch('https://jury-forge.test/api/health');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, name: PRODUCT_NAME });
  });

  it('has a working D1 binding', async () => {
    await env.DB.exec(
      'CREATE TABLE IF NOT EXISTS smoke (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
    );
    await env.DB.prepare('INSERT INTO smoke (key, value) VALUES (?, ?)').bind('k', 'v').run();
    const row = await env.DB.prepare('SELECT value FROM smoke WHERE key = ?')
      .bind('k')
      .first<{ value: string }>();
    expect(row?.value).toBe('v');
  });
});
