import type { InstanceSettings, SettingsResponse } from '@jury-forge/shared';
import { Hono } from 'hono';
import { recordActivity } from '../lib/activity';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  updateSettings,
  validateSettingsPatch,
} from '../lib/settings';
import { requireSession, sameOrigin, type AppEnv } from '../middleware';

export const settingsRoutes = new Hono<AppEnv>();

settingsRoutes.use('*', requireSession(), sameOrigin());

settingsRoutes.get('/', async (c) => {
  const body: SettingsResponse = {
    settings: await loadSettings(c.env.DB),
    defaults: DEFAULT_SETTINGS,
  };
  return c.json(body);
});

settingsRoutes.patch('/', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_request' }, 400);
  }
  const result = validateSettingsPatch(body);
  if (!result.ok) {
    return c.json({ error: result.error }, 400);
  }
  const before = await loadSettings(c.env.DB);
  const settings = await updateSettings(c.env.DB, result.patch);
  for (const key of Object.keys(result.patch) as (keyof InstanceSettings)[]) {
    if (JSON.stringify(before[key]) !== JSON.stringify(settings[key])) {
      await recordActivity(c.env.DB, {
        actor: c.get('user').login,
        action: 'setting_change',
        target: key,
        detail: JSON.stringify(settings[key]),
      });
    }
  }
  const response: SettingsResponse = {
    settings,
    defaults: DEFAULT_SETTINGS,
  };
  return c.json(response);
});
