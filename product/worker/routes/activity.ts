import { ActivityPageSchema } from '@jury-forge/shared';
import { Hono } from 'hono';
import { listActivity, parseActivityCursor } from '../lib/activity';
import { errorResponse, respond } from '../lib/respond';
import { requireSession, sameOrigin, type AppEnv } from '../middleware';

export const activityRoutes = new Hono<AppEnv>();

activityRoutes.use('*', requireSession(), sameOrigin());

activityRoutes.get('/', async (c) => {
  const rawLimit = Number(c.req.query('limit') ?? '50');
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100) : 50;
  const cursor = c.req.query('cursor');
  if (cursor !== undefined && parseActivityCursor(cursor) === null) {
    return errorResponse('invalid_request', 400);
  }
  return respond(ActivityPageSchema, await listActivity(c.env.DB, { limit, cursor }));
});
