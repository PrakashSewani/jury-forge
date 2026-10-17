import { Hono } from 'hono';
import { importEncryptionKey } from '../lib/crypto';
import {
  deleteReviewerRow,
  getReviewer,
  insertReviewer,
  listReviewers,
  reviewerCreate,
  reviewerUpdate,
  updateReviewerRow,
} from '../lib/reviewers';
import { requireSession, sameOrigin, type AppEnv } from '../middleware';

export const reviewerRoutes = new Hono<AppEnv>();

reviewerRoutes.use('*', requireSession(), sameOrigin());

reviewerRoutes.get('/', async (c) => {
  return c.json(await listReviewers(c.env.DB));
});

reviewerRoutes.post('/', async (c) => {
  const parsed = reviewerCreate.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'invalid_request' }, 400);
  }
  if (parsed.data.apiKey !== undefined && !c.env.ENCRYPTION_KEY) {
    return c.json({ error: 'encryption_key_unset' }, 500);
  }
  const encryptionKey = c.env.ENCRYPTION_KEY
    ? await importEncryptionKey(c.env.ENCRYPTION_KEY)
    : null;

  const id = crypto.randomUUID();
  await insertReviewer(c.env.DB, id, encryptionKey, parsed.data);
  return c.json(await getReviewer(c.env.DB, id), 201);
});

reviewerRoutes.get('/:id', async (c) => {
  const reviewer = await getReviewer(c.env.DB, c.req.param('id'));
  if (!reviewer) {
    return c.json({ error: 'not_found' }, 404);
  }
  return c.json(reviewer);
});

reviewerRoutes.patch('/:id', async (c) => {
  const parsed = reviewerUpdate.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'invalid_request' }, 400);
  }
  const id = c.req.param('id');
  if (!(await getReviewer(c.env.DB, id))) {
    return c.json({ error: 'not_found' }, 404);
  }
  if (typeof parsed.data.apiKey === 'string' && !c.env.ENCRYPTION_KEY) {
    return c.json({ error: 'encryption_key_unset' }, 500);
  }
  const encryptionKey = c.env.ENCRYPTION_KEY
    ? await importEncryptionKey(c.env.ENCRYPTION_KEY)
    : null;
  await updateReviewerRow(c.env.DB, id, encryptionKey, parsed.data);
  return c.json(await getReviewer(c.env.DB, id));
});

reviewerRoutes.delete('/:id', async (c) => {
  const deleted = await deleteReviewerRow(c.env.DB, c.req.param('id'));
  if (!deleted) {
    return c.json({ error: 'not_found' }, 404);
  }
  return c.body(null, 204);
});
