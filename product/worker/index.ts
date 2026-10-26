import { PRODUCT_NAME, HealthResponseSchema, type HealthResponse } from '@jury-forge/shared';
import { Hono } from 'hono';
import { errorResponse, respond } from './lib/respond';
import type { AppEnv } from './middleware';
import { activityRoutes } from './routes/activity';
import { authRoutes } from './routes/auth';
import { instanceRoutes } from './routes/instance';
import { packRoutes } from './routes/packs';
import { repositoryRoutes } from './routes/repositories';
import { reviewerRoutes } from './routes/reviewers';
import { runRoutes } from './routes/runs';
import { settingsRoutes } from './routes/settings';
import { setupRoutes } from './routes/setup';
import { webhookRoutes } from './routes/webhooks';

const app = new Hono<AppEnv>();

app.get('/api/health', () => {
  const body: HealthResponse = { ok: true, name: PRODUCT_NAME };
  return respond(HealthResponseSchema, body);
});

app.route('/api/setup', setupRoutes);
app.route('/api/instance', instanceRoutes);
app.route('/api/auth', authRoutes);
app.route('/api/reviewers', reviewerRoutes);
app.route('/api/packs', packRoutes);
app.route('/api/repositories', repositoryRoutes);
app.route('/api/runs', runRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/activity', activityRoutes);
app.route('/api/webhooks', webhookRoutes);

app.notFound(() => errorResponse('not_found', 404));

app.onError((error) => {
  console.error(error);
  return errorResponse('internal_error', 500);
});

export { RunEngine } from './run-engine';

export default app;
