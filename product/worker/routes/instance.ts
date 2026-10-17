import { Hono } from 'hono';
import { computeReadiness } from '../lib/readiness';
import { requireSession, type AppEnv } from '../middleware';

export const instanceRoutes = new Hono<AppEnv>();

instanceRoutes.use('*', requireSession());

instanceRoutes.get('/readiness', async (c) => {
  return c.json(await computeReadiness(c.env.DB));
});
