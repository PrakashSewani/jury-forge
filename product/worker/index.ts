import { PRODUCT_NAME, type HealthResponse } from '@jury-forge/shared';
import { Hono } from 'hono';

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => {
  const body: HealthResponse = { ok: true, name: PRODUCT_NAME };
  return c.json(body);
});

app.notFound((c) => c.json({ error: 'not_found' }, 404));

export default app;
