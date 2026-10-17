import {
  SettingsResponseSchema,
  type InstanceSettings,
  type SettingsResponse,
} from '@jury-forge/shared';
import { Hono } from 'hono';
import { recordActivity } from '../lib/activity';
import { errorResponse, respond } from '../lib/respond';
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
  return respond(SettingsResponseSchema, body);
});

settingsRoutes.patch('/', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return errorResponse('invalid_request', 400);
  }
  const result = validateSettingsPatch(body);
  if (!result.ok) {
    return errorResponse(result.error, 400);
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
  return respond(SettingsResponseSchema, response);
});
