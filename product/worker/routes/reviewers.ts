import {
  ReviewerSchema,
  ReviewersExportDocumentSchema,
  ReviewersImportResultSchema,
  type ReviewersImportResult,
} from '@jury-forge/shared';
import { Hono } from 'hono';
import { recordActivity } from '../lib/activity';
import { keyRingValues, loadKeyRing } from '../lib/crypto';
import { errorResponse, respond } from '../lib/respond';
import {
  buildExportDocument,
  deleteReviewerRow,
  getReviewer,
  importReviewers,
  insertReviewer,
  listReviewers,
  reviewerCreate,
  reviewersImportDocument,
  reviewerUpdate,
  storedApiKeyCiphertext,
  updateReviewerRow,
  type ReviewerUpdate,
} from '../lib/reviewers';
import { requireSession, sameOrigin, type AppEnv } from '../middleware';

export const reviewerRoutes = new Hono<AppEnv>();

reviewerRoutes.use('*', requireSession(), sameOrigin());

reviewerRoutes.get('/', async (c) => {
  return respond(ReviewerSchema.array(), await listReviewers(c.env.DB));
});

reviewerRoutes.get('/export', async (c) => {
  const reviewers = await listReviewers(c.env.DB);
  const response = respond(
    ReviewersExportDocumentSchema,
    buildExportDocument(reviewers, Math.floor(Date.now() / 1_000)),
  );
  response.headers.set('Content-Disposition', 'attachment; filename="jury-forge-reviewers.json"');
  return response;
});

reviewerRoutes.post('/import', async (c) => {
  const parsed = reviewersImportDocument.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_request', 400);
  }
  const values = keyRingValues(c.env);
  const ring = values ? await loadKeyRing(values) : null;
  const result = await importReviewers(c.env.DB, ring, parsed.data);
  await recordActivity(c.env.DB, {
    actor: c.get('user').login,
    action: 'reviewer_import',
    target: null,
    detail: importDetail(result),
  });
  return respond(ReviewersImportResultSchema, result);
});

reviewerRoutes.post('/', async (c) => {
  const parsed = reviewerCreate.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_request', 400);
  }
  if (
    (parsed.data.apiKey !== undefined || parsed.data.apiKeyFromReviewerId !== undefined) &&
    !c.env.ENCRYPTION_KEY
  ) {
    return errorResponse('encryption_key_unset', 500);
  }
  const values = keyRingValues(c.env);
  const ring = values ? await loadKeyRing(values) : null;
  // Same reuse rule as PATCH: copy the source ciphertext verbatim, or refuse with a defined 400 when
  // there is no key to copy.
  let copied: string | undefined;
  if (parsed.data.apiKeyFromReviewerId !== undefined) {
    const stored = await storedApiKeyCiphertext(c.env.DB, parsed.data.apiKeyFromReviewerId);
    if (stored === null) {
      return errorResponse('invalid_request', 400);
    }
    copied = stored;
  }

  const id = crypto.randomUUID();
  await insertReviewer(c.env.DB, id, ring, parsed.data, copied);
  const reviewer = await getReviewer(c.env.DB, id);
  if (!reviewer) {
    // The row that was just written did not read back. Answer with the taxonomy's own code instead
    // of a `null` body: the dashboard requires a reviewer (`createReviewer` parses the same
    // non-nullable `ReviewerSchema`), so a 201 + `null` could only surface as `invalid_response`.
    return errorResponse('internal_error', 500);
  }
  await recordActivity(c.env.DB, {
    actor: c.get('user').login,
    action: 'reviewer_create',
    target: reviewer.name,
  });
  return respond(ReviewerSchema, reviewer, 201);
});

reviewerRoutes.get('/:id', async (c) => {
  const reviewer = await getReviewer(c.env.DB, c.req.param('id'));
  if (!reviewer) {
    return errorResponse('not_found', 404);
  }
  return respond(ReviewerSchema, reviewer);
});

reviewerRoutes.patch('/:id', async (c) => {
  const parsed = reviewerUpdate.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_request', 400);
  }
  const id = c.req.param('id');
  if (!(await getReviewer(c.env.DB, id))) {
    return errorResponse('not_found', 404);
  }
  if (
    (typeof parsed.data.apiKey === 'string' || parsed.data.apiKeyFromReviewerId !== undefined) &&
    !c.env.ENCRYPTION_KEY
  ) {
    return errorResponse('encryption_key_unset', 500);
  }
  const values = keyRingValues(c.env);
  const ring = values ? await loadKeyRing(values) : null;
  // A reuse copies the source row's ciphertext verbatim. A source that does not exist, or holds
  // no key, has nothing to copy: that is a request error, not a silently keyless reviewer.
  let copied: string | undefined;
  if (parsed.data.apiKeyFromReviewerId !== undefined) {
    const stored = await storedApiKeyCiphertext(c.env.DB, parsed.data.apiKeyFromReviewerId);
    if (stored === null) {
      return errorResponse('invalid_request', 400);
    }
    copied = stored;
  }
  const { apiKeyReencrypted } = await updateReviewerRow(c.env.DB, id, ring, parsed.data, copied);
  const reviewer = await getReviewer(c.env.DB, id);
  if (!reviewer) {
    // Same as the create above: the row existed at the check and is gone after the update, so this
    // is a 500 the dashboard can render, never a `null` body it would call `invalid_response`.
    return errorResponse('internal_error', 500);
  }
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
  return respond(ReviewerSchema, reviewer);
});

reviewerRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const reviewer = await getReviewer(c.env.DB, id);
  if (!reviewer) {
    return errorResponse('not_found', 404);
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
  const parts = Object.keys(patch).filter(
    (key) => key !== 'apiKey' && key !== 'apiKeyFromReviewerId',
  );
  if (patch.apiKeyFromReviewerId !== undefined) {
    parts.push('api_key: reused from another reviewer');
  } else if (patch.apiKey === null) {
    parts.push('api_key: cleared');
  } else if (patch.apiKey !== undefined) {
    parts.push('api_key: set');
  } else if (apiKeyReencrypted) {
    parts.push('api_key: re-wrapped');
  }
  return parts.length === 0 ? null : parts.join(', ');
}

function importDetail(result: ReviewersImportResult): string {
  return `created ${result.created}, updated ${result.updated}, unchanged ${result.unchanged}, skipped ${result.skipped}`;
}
