import type { SettingsResponse } from '@jury-forge/shared';
import { Hono } from 'hono';
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
  const response: SettingsResponse = {
    settings: await updateSettings(c.env.DB, result.patch),
    defaults: DEFAULT_SETTINGS,
  };
  return c.json(response);
});
