import { InstanceReadinessSchema } from '@jury-forge/shared';
import { Hono } from 'hono';
import { computeReadiness } from '../lib/readiness';
import { respond } from '../lib/respond';
import { requireSession, type AppEnv } from '../middleware';

export const instanceRoutes = new Hono<AppEnv>();

instanceRoutes.use('*', requireSession());

instanceRoutes.get('/readiness', async (c) => {
  return respond(InstanceReadinessSchema, await computeReadiness(c.env.DB));
});
