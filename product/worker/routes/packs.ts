import type { PackPreview, PackGrant } from '@jury-forge/shared';
import {
  PackCreateResultSchema,
  PackDetailSchema,
  PackGrantSchema,
  PackGrantsUpdateSchema,
  PackPreviewRequestSchema,
  PackPreviewSchema,
  PackSummarySchema,
  PackVersionDetailSchema,
} from '@jury-forge/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { recordActivity } from '../lib/activity';
import { analyzePack, slugifyPackName } from '../lib/pack-format';
import {
  createPackVersion,
  findPackById,
  findPackBySlug,
  getPack,
  getPackVersion,
  listPacks,
  replacePackGrants,
} from '../lib/packs';
import { errorResponse, respond } from '../lib/respond';
import { loadSettings } from '../lib/settings';
import { requireSession, sameOrigin, type AppEnv } from '../middleware';

export const packRoutes = new Hono<AppEnv>();

packRoutes.use('*', requireSession(), sameOrigin());

packRoutes.get('/', async (c) => {
  return respond(z.array(PackSummarySchema), await listPacks(c.env.DB));
});

packRoutes.post('/preview', async (c) => {
  const parsed = PackPreviewRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_request', 400);
  }
  const settings = await loadSettings(c.env.DB);
  const analysis = await analyzePack(parsed.data.files, {
    root: parsed.data.root,
    settings,
  });
  const existing = analysis.ok
    ? parsed.data.packId !== undefined
      ? await findPackById(c.env.DB, parsed.data.packId)
      : await findPackBySlug(c.env.DB, slugifyPackName(analysis.manifest.name))
    : null;
  const warnings = [...analysis.warnings];
  if (analysis.ok && existing) {
    warnings.push(
      parsed.data.forceNew === true
        ? `A separate pack will be created with a suffixed slug; ${existing.slug} is unchanged.`
        : `This upload becomes version ${existing.versionCount + 1} of ${existing.slug}; existing grants use the latest version immediately.`,
    );
  }
  if (analysis.ok && parsed.data.packId !== undefined && existing === null) {
    warnings.push('That pack no longer exists; a create request will answer not_found.');
  }
  const body: PackPreview = analysis.ok
    ? {
        valid: true,
        errors: [],
        warnings,
        manifest: analysis.manifest,
        hash: analysis.hash,
        files: analysis.docs.map((doc) => ({
          path: doc.path,
          bytes: doc.bytes,
          neverQuote: doc.neverQuote,
        })),
        ignoredFiles: analysis.ignoredFiles,
        ignoredCount: analysis.ignoredCount,
        candidates: [],
        existingPack: existing,
      }
    : {
        valid: false,
        errors: analysis.errors,
        warnings,
        manifest: null,
        hash: null,
        files: [],
        ignoredFiles: analysis.ignoredFiles,
        ignoredCount: analysis.ignoredCount,
        candidates: analysis.candidates,
        existingPack: null,
      };
  return respond(PackPreviewSchema, body);
});

packRoutes.post('/', async (c) => {
  const parsed = PackPreviewRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_request', 400);
  }
  if (parsed.data.packId !== undefined && parsed.data.forceNew === true) {
    return errorResponse('invalid_request', 400);
  }
  const analysis = await analyzePack(parsed.data.files, {
    root: parsed.data.root,
    settings: await loadSettings(c.env.DB),
  });
  if (!analysis.ok) {
    return errorResponse('invalid_request', 400);
  }
  const result = await createPackVersion(c.env.DB, analysis, c.get('user').login, {
    packId: parsed.data.packId,
    forceNew: parsed.data.forceNew,
  });
  if (result === null) {
    return errorResponse('not_found', 404);
  }
  if (result.createdVersion) {
    await recordActivity(c.env.DB, {
      actor: c.get('user').login,
      action: 'pack_version',
      target: result.pack.slug,
      detail: `${result.version.hash.slice(0, 8)}, ${result.version.fileCount} file(s), ${result.version.totalBytes} bytes`,
    });
  }
  return respond(PackCreateResultSchema, result, result.createdVersion ? 201 : 200);
});

packRoutes.get('/:id/versions/:versionId', async (c) => {
  const version = await getPackVersion(c.env.DB, c.req.param('id'), c.req.param('versionId'));
  if (!version) {
    return errorResponse('not_found', 404);
  }
  return respond(PackVersionDetailSchema, version);
});

packRoutes.get('/:id', async (c) => {
  const pack = await getPack(c.env.DB, c.req.param('id'));
  if (!pack) {
    return errorResponse('not_found', 404);
  }
  return respond(PackDetailSchema, pack);
});

function grantSummary(grants: PackGrant[]): string {
  if (grants.length === 0) {
    return 'none';
  }
  const shown = grants
    .slice(0, 10)
    .map((grant) =>
      grant.scope === 'global'
        ? 'global'
        : `${grant.scope} ${grant.targetLabel ?? grant.targetId ?? ''}`.trim(),
    );
  return grants.length > 10
    ? `${shown.join(', ')} · and ${grants.length - 10} more`
    : shown.join(', ');
}

packRoutes.put('/:id/grants', async (c) => {
  const parsed = PackGrantsUpdateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_request', 400);
  }
  const id = c.req.param('id');
  const pack = await getPack(c.env.DB, id);
  if (!pack) {
    return errorResponse('not_found', 404);
  }
  const result = await replacePackGrants(c.env.DB, id, parsed.data.grants);
  if (!result.ok) {
    return errorResponse('invalid_request', 400);
  }
  await recordActivity(c.env.DB, {
    actor: c.get('user').login,
    action: 'pack_grants',
    target: pack.pack.slug,
    detail: grantSummary(result.grants),
  });
  return respond(z.array(PackGrantSchema), result.grants);
});
