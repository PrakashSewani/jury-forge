import { PRODUCT_NAME, type HealthResponse } from '@jury-forge/shared';
import { Hono } from 'hono';
import type { AppEnv } from './middleware';
import { authRoutes } from './routes/auth';
import { reviewerRoutes } from './routes/reviewers';
import { runRoutes } from './routes/runs';
import { setupRoutes } from './routes/setup';
import { webhookRoutes } from './routes/webhooks';

const app = new Hono<AppEnv>();

app.get('/api/health', (c) => {
  const body: HealthResponse = { ok: true, name: PRODUCT_NAME };
  return c.json(body);
});

app.route('/api/setup', setupRoutes);
app.route('/api/auth', authRoutes);
app.route('/api/reviewers', reviewerRoutes);
app.route('/api/runs', runRoutes);
app.route('/api/webhooks', webhookRoutes);

app.notFound((c) => c.json({ error: 'not_found' }, 404));

app.onError((error, c) => {
  console.error(error);
  return c.json({ error: 'internal_error' }, 500);
});

export { RunEngine } from './run-engine';

export default app;
