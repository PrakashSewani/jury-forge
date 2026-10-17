import { Hono } from 'hono';
import { recordActivity } from '../lib/activity';
import { keyRingValues, loadKeyRing } from '../lib/crypto';
import {
  deleteReviewerRow,
  getReviewer,
  insertReviewer,
  listReviewers,
  reviewerCreate,
  reviewerUpdate,
  updateReviewerRow,
  type ReviewerUpdate,
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
  const values = keyRingValues(c.env);
  const ring = values ? await loadKeyRing(values) : null;

  const id = crypto.randomUUID();
  await insertReviewer(c.env.DB, id, ring, parsed.data);
  const reviewer = await getReviewer(c.env.DB, id);
  if (reviewer) {
    await recordActivity(c.env.DB, {
      actor: c.get('user').login,
      action: 'reviewer_create',
      target: reviewer.name,
    });
  }
  return c.json(reviewer, 201);
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
  const values = keyRingValues(c.env);
  const ring = values ? await loadKeyRing(values) : null;
  const { apiKeyReencrypted } = await updateReviewerRow(c.env.DB, id, ring, parsed.data);
  const reviewer = await getReviewer(c.env.DB, id);
  if (reviewer) {
    await recordActivity(c.env.DB, {
      actor: c.get('user').login,
      action: 'reviewer_update',
      target: reviewer.name,
      detail: reviewerUpdateDetail(parsed.data, apiKeyReencrypted),
    });
    if (apiKeyReencrypted && ring) {
      await recordActivity(c.env.DB, {
        actor: c.get('user').login,
        action: 'credential_rotation',
        target: reviewer.name,
        detail: `api_key re-wrapped for key version ${ring.current.version}`,
      });
    }
  }
  return c.json(reviewer);
});

reviewerRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const reviewer = await getReviewer(c.env.DB, id);
  if (!reviewer) {
    return c.json({ error: 'not_found' }, 404);
  }
  await deleteReviewerRow(c.env.DB, id);
  await recordActivity(c.env.DB, {
    actor: c.get('user').login,
    action: 'reviewer_delete',
    target: reviewer.name,
  });
  return c.body(null, 204);
});

function reviewerUpdateDetail(patch: ReviewerUpdate, apiKeyReencrypted: boolean): string | null {
  const parts = Object.keys(patch).filter((key) => key !== 'apiKey');
  if (patch.apiKey === null) {
    parts.push('api_key: cleared');
  } else if (patch.apiKey !== undefined) {
    parts.push('api_key: set');
  } else if (apiKeyReencrypted) {
    parts.push('api_key: re-wrapped');
  }
  return parts.length === 0 ? null : parts.join(', ');
}
