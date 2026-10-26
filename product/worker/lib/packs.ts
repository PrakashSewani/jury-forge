import type {
  PackDetail,
  PackGrant,
  PackGrantScope,
  PackManifest,
  PackSummary,
  PackVersionDetail,
  PackVersionSummary,
  RunNotAppliedPack,
} from '@jury-forge/shared';
import { PackManifestSchema } from '@jury-forge/shared';
import type { PackAnalysisOk, ResolvedDoc, ResolvedPack } from './pack-format';
import { slugifyPackName } from './pack-format';
import { globMatches } from './scope';

interface PackRow {
  id: string;
  slug: string;
  name: string;
  created_at: number;
  updated_at: number;
}

interface VersionRow {
  id: string;
  pack_id: string;
  hash: string;
  manifest_path: string;
  manifest_json: string;
  body: string;
  raw_manifest: string;
  manifest_bytes: number;
  docs_bytes: number;
  total_bytes: number;
  file_count: number;
  created_at: number;
  created_by: string | null;
}

interface GrantRow {
  id: string;
  scope: PackGrantScope;
  target_id: string;
  precedence: number;
  enabled: number;
  repo_name: string | null;
  reviewer_name: string | null;
}

const VERSION_COLUMNS =
  'id, pack_id, hash, manifest_path, manifest_json, body, raw_manifest, manifest_bytes, docs_bytes, total_bytes, file_count, created_at, created_by';

function parseManifest(raw: string): PackManifest {
  return PackManifestSchema.parse(JSON.parse(raw) as unknown);
}

function versionSummary(row: VersionRow): PackVersionSummary {
  return {
    id: row.id,
    hash: row.hash,
    manifestPath: row.manifest_path,
    createdAt: row.created_at,
    createdBy: row.created_by,
    manifestBytes: row.manifest_bytes,
    docsBytes: row.docs_bytes,
    totalBytes: row.total_bytes,
    fileCount: row.file_count,
  };
}

function packSummary(pack: PackRow, version: VersionRow, grantCount: number): PackSummary {
  return {
    id: pack.id,
    slug: pack.slug,
    name: pack.name,
    createdAt: pack.created_at,
    updatedAt: pack.updated_at,
    grantCount,
    latest: {
      ...versionSummary(version),
      manifest: parseManifest(version.manifest_json),
    },
  };
}

async function getPackRow(db: D1Database, id: string): Promise<PackRow | null> {
  return db
    .prepare('SELECT id, slug, name, created_at, updated_at FROM packs WHERE id = ?')
    .bind(id)
    .first<PackRow>();
}

async function getPackRowBySlug(db: D1Database, slug: string): Promise<PackRow | null> {
  return db
    .prepare('SELECT id, slug, name, created_at, updated_at FROM packs WHERE slug = ?')
    .bind(slug)
    .first<PackRow>();
}

async function getLatestVersion(db: D1Database, packId: string): Promise<VersionRow | null> {
  return db
    .prepare(
      `SELECT ${VERSION_COLUMNS} FROM pack_versions WHERE pack_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    )
    .bind(packId)
    .first<VersionRow>();
}

async function getVersion(
  db: D1Database,
  packId: string,
  versionId: string,
): Promise<VersionRow | null> {
  return db
    .prepare(`SELECT ${VERSION_COLUMNS} FROM pack_versions WHERE pack_id = ? AND id = ?`)
    .bind(packId, versionId)
    .first<VersionRow>();
}

async function grantCount(db: D1Database, packId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS count FROM pack_grants WHERE pack_id = ?')
    .bind(packId)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function listPacks(db: D1Database): Promise<PackSummary[]> {
  const rows = await db
    .prepare(
      `SELECT p.id AS pack_id, p.slug AS pack_slug, p.name AS pack_name,
              p.created_at AS pack_created_at, p.updated_at AS pack_updated_at,
              v.id AS version_id, v.hash, v.manifest_path, v.manifest_json, v.body, v.raw_manifest,
              v.manifest_bytes, v.docs_bytes, v.total_bytes, v.file_count,
              v.created_at AS version_created_at, v.created_by,
              (SELECT COUNT(*) FROM pack_grants g WHERE g.pack_id = p.id) AS grant_count
       FROM packs p
       JOIN pack_versions v ON v.id = (
         SELECT id FROM pack_versions WHERE pack_id = p.id ORDER BY created_at DESC, rowid DESC LIMIT 1
       )
       ORDER BY p.name COLLATE NOCASE, p.id`,
    )
    .all<{
      pack_id: string;
      pack_slug: string;
      pack_name: string;
      pack_created_at: number;
      pack_updated_at: number;
      version_id: string;
      hash: string;
      manifest_path: string;
      manifest_json: string;
      body: string;
      raw_manifest: string;
      manifest_bytes: number;
      docs_bytes: number;
      total_bytes: number;
      file_count: number;
      version_created_at: number;
      created_by: string | null;
      grant_count: number;
    }>();
  return rows.results.map((row) => {
    const pack: PackRow = {
      id: row.pack_id,
      slug: row.pack_slug,
      name: row.pack_name,
      created_at: row.pack_created_at,
      updated_at: row.pack_updated_at,
    };
    const version: VersionRow = {
      id: row.version_id,
      pack_id: row.pack_id,
      hash: row.hash,
      manifest_path: row.manifest_path,
      manifest_json: row.manifest_json,
      body: row.body,
      raw_manifest: row.raw_manifest,
      manifest_bytes: row.manifest_bytes,
      docs_bytes: row.docs_bytes,
      total_bytes: row.total_bytes,
      file_count: row.file_count,
      created_at: row.version_created_at,
      created_by: row.created_by,
    };
    return packSummary(pack, version, row.grant_count);
  });
}

export async function getPack(db: D1Database, id: string): Promise<PackDetail | null> {
  const pack = await getPackRow(db, id);
  if (!pack) {
    return null;
  }
  const versions = await db
    .prepare(
      `SELECT ${VERSION_COLUMNS} FROM pack_versions WHERE pack_id = ? ORDER BY created_at DESC, rowid DESC`,
    )
    .bind(id)
    .all<VersionRow>();
  const latest = versions.results[0];
  if (!latest) {
    return null;
  }
  const [grants, files, count] = await Promise.all([
    listPackGrants(db, id),
    db
      .prepare('SELECT path, bytes, never_quote FROM pack_files WHERE version_id = ? ORDER BY path')
      .bind(latest.id)
      .all<{ path: string; bytes: number; never_quote: number }>(),
    grantCount(db, id),
  ]);
  return {
    pack: packSummary(pack, latest, count),
    versions: versions.results.map(versionSummary),
    grants,
    latest: {
      ...versionSummary(latest),
      manifest: parseManifest(latest.manifest_json),
      body: latest.body,
      files: files.results.map((file) => ({
        path: file.path,
        bytes: file.bytes,
        neverQuote: file.never_quote === 1,
      })),
    },
  };
}

export async function getPackVersion(
  db: D1Database,
  packId: string,
  versionId: string,
): Promise<PackVersionDetail | null> {
  const version = await getVersion(db, packId, versionId);
  if (!version) {
    return null;
  }
  const files = await db
    .prepare(
      'SELECT path, bytes, text, never_quote FROM pack_files WHERE version_id = ? ORDER BY path',
    )
    .bind(version.id)
    .all<{ path: string; bytes: number; text: string; never_quote: number }>();
  return {
    ...versionSummary(version),
    manifest: parseManifest(version.manifest_json),
    body: version.body,
    files: files.results.map((file) => ({
      path: file.path,
      bytes: file.bytes,
      neverQuote: file.never_quote === 1,
      text: file.text,
    })),
  };
}

export async function findPackBySlug(
  db: D1Database,
  slug: string,
): Promise<{ id: string; slug: string; versionCount: number; latestHash: string | null } | null> {
  const pack = await getPackRowBySlug(db, slug);
  if (!pack) {
    return null;
  }
  const versions = await db
    .prepare(
      'SELECT hash FROM pack_versions WHERE pack_id = ? ORDER BY created_at DESC, rowid DESC',
    )
    .bind(pack.id)
    .all<{ hash: string }>();
  return {
    id: pack.id,
    slug: pack.slug,
    versionCount: versions.results.length,
    latestHash: versions.results[0]?.hash ?? null,
  };
}

export async function findPackById(
  db: D1Database,
  id: string,
): Promise<{ id: string; slug: string; versionCount: number; latestHash: string | null } | null> {
  const pack = await getPackRow(db, id);
  if (!pack) {
    return null;
  }
  return findPackBySlug(db, pack.slug);
}

export interface PackCreateOutcome {
  pack: PackSummary;
  version: PackVersionSummary;
  createdVersion: boolean;
}

async function uniqueSlug(db: D1Database, base: string): Promise<string> {
  let slug = base;
  for (let index = 2; index < 100; index += 1) {
    const existing = await getPackRowBySlug(db, slug);
    if (!existing) {
      return slug;
    }
    slug = `${base}-${index}`;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Store one analyzed version. Without `packId` the manifest's slug decides the pack; a matching
 * pack receives the version (latest-always), and `forceNew` asks for a separate pack with a
 * suffixed slug instead. Identical content returns the existing version.
 */
export async function createPackVersion(
  db: D1Database,
  analysis: PackAnalysisOk,
  actor: string,
  options: { packId?: string; forceNew?: boolean } = {},
): Promise<PackCreateOutcome | null> {
  let pack: PackRow | null;
  if (options.packId !== undefined) {
    pack = await getPackRow(db, options.packId);
    if (!pack) {
      return null;
    }
  } else {
    const base = slugifyPackName(analysis.manifest.name);
    pack = await getPackRowBySlug(db, base);
    if (!pack) {
      const slug = options.forceNew === true ? await uniqueSlug(db, base) : base;
      const id = crypto.randomUUID();
      await db
        .prepare('INSERT INTO packs (id, slug, name) VALUES (?, ?, ?)')
        .bind(id, slug, analysis.manifest.name)
        .run();
      pack = await getPackRow(db, id);
      if (!pack) {
        throw new Error('the pack row could not be read back');
      }
    } else if (options.forceNew === true) {
      const id = crypto.randomUUID();
      const slug = await uniqueSlug(db, base);
      await db
        .prepare('INSERT INTO packs (id, slug, name) VALUES (?, ?, ?)')
        .bind(id, slug, analysis.manifest.name)
        .run();
      pack = await getPackRow(db, id);
      if (!pack) {
        throw new Error('the pack row could not be read back');
      }
    }
  }

  const existing = await db
    .prepare(`SELECT ${VERSION_COLUMNS} FROM pack_versions WHERE pack_id = ? AND hash = ?`)
    .bind(pack.id, analysis.hash)
    .first<VersionRow>();
  if (existing) {
    const latest = (await getLatestVersion(db, pack.id)) ?? existing;
    return {
      pack: packSummary(pack, latest, await grantCount(db, pack.id)),
      version: versionSummary(existing),
      createdVersion: false,
    };
  }

  const versionId = crypto.randomUUID();
  const statements = [
    db
      .prepare(
        `INSERT INTO pack_versions
          (id, pack_id, hash, manifest_path, manifest_json, body, raw_manifest, manifest_bytes, docs_bytes, total_bytes, file_count, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        versionId,
        pack.id,
        analysis.hash,
        analysis.manifestPath,
        JSON.stringify(analysis.manifest),
        analysis.body,
        analysis.rawManifest,
        analysis.manifestBytes,
        analysis.docsBytes,
        analysis.totalBytes,
        analysis.docs.length,
        actor,
      ),
    ...analysis.docs.map((doc) =>
      db
        .prepare(
          'INSERT INTO pack_files (version_id, path, bytes, text, never_quote) VALUES (?, ?, ?, ?, ?)',
        )
        .bind(versionId, doc.path, doc.bytes, doc.text, doc.neverQuote ? 1 : 0),
    ),
    db
      .prepare('UPDATE packs SET name = ?, updated_at = unixepoch() WHERE id = ?')
      .bind(analysis.manifest.name, pack.id),
  ];
  await db.batch(statements);

  const stored = await getVersion(db, pack.id, versionId);
  const latest = (await getLatestVersion(db, pack.id)) ?? stored;
  if (!stored || !latest) {
    throw new Error('the version row could not be read back');
  }
  const updatedPack = (await getPackRow(db, pack.id)) ?? pack;
  return {
    pack: packSummary(updatedPack, latest, await grantCount(db, pack.id)),
    version: versionSummary(stored),
    createdVersion: true,
  };
}

export async function listPackGrants(db: D1Database, packId: string): Promise<PackGrant[]> {
  const rows = await db
    .prepare(
      `SELECT g.id, g.scope, g.target_id, g.precedence, g.enabled,
              r.full_name AS repo_name, rev.name AS reviewer_name
       FROM pack_grants g
       LEFT JOIN repositories r ON g.scope = 'repository' AND r.repo_id = CAST(g.target_id AS INTEGER)
       LEFT JOIN reviewers rev ON g.scope = 'reviewer' AND rev.id = g.target_id
       WHERE g.pack_id = ?
       ORDER BY g.precedence ASC, g.scope ASC, g.target_id ASC`,
    )
    .bind(packId)
    .all<GrantRow>();
  return rows.results.map((row) => ({
    id: row.id,
    scope: row.scope,
    targetId: row.scope === 'global' ? null : row.target_id,
    targetLabel:
      row.scope === 'repository'
        ? row.repo_name
        : row.scope === 'reviewer'
          ? row.reviewer_name
          : null,
    precedence: row.precedence,
    enabled: row.enabled === 1,
  }));
}

const DEFAULT_PRECEDENCE: Record<PackGrantScope, number> = {
  global: 100,
  repository: 200,
  reviewer: 300,
};

export type GrantReplaceResult =
  { ok: true; grants: PackGrant[] } | { ok: false; error: 'duplicate' | 'invalid_target' };

export async function replacePackGrants(
  db: D1Database,
  packId: string,
  inputs: {
    scope: PackGrantScope;
    targetId?: string | null;
    precedence?: number;
    enabled?: boolean;
  }[],
): Promise<GrantReplaceResult> {
  const seen = new Set<string>();
  const grants: {
    id: string;
    scope: PackGrantScope;
    targetId: string;
    precedence: number;
    enabled: boolean;
  }[] = [];
  for (const input of inputs) {
    const targetId = input.scope === 'global' ? '' : (input.targetId ?? '').trim();
    if (
      input.scope === 'global' &&
      input.targetId !== undefined &&
      input.targetId !== null &&
      input.targetId.trim() !== ''
    ) {
      return { ok: false, error: 'invalid_target' };
    }
    if (input.scope !== 'global' && targetId === '') {
      return { ok: false, error: 'invalid_target' };
    }
    const key = `${input.scope}:${targetId}`;
    if (seen.has(key)) {
      return { ok: false, error: 'duplicate' };
    }
    seen.add(key);
    if (input.scope === 'repository') {
      const repoId = Number(targetId);
      if (!Number.isInteger(repoId)) {
        return { ok: false, error: 'invalid_target' };
      }
      const found = await db
        .prepare('SELECT 1 FROM repositories WHERE repo_id = ?')
        .bind(repoId)
        .first();
      if (!found) {
        return { ok: false, error: 'invalid_target' };
      }
    }
    if (input.scope === 'reviewer') {
      const found = await db.prepare('SELECT 1 FROM reviewers WHERE id = ?').bind(targetId).first();
      if (!found) {
        return { ok: false, error: 'invalid_target' };
      }
    }
    grants.push({
      id: crypto.randomUUID(),
      scope: input.scope,
      targetId,
      precedence: input.precedence ?? DEFAULT_PRECEDENCE[input.scope],
      enabled: input.enabled ?? true,
    });
  }
  const statements = [
    db.prepare('DELETE FROM pack_grants WHERE pack_id = ?').bind(packId),
    ...grants.map((grant) =>
      db
        .prepare(
          'INSERT INTO pack_grants (id, pack_id, scope, target_id, precedence, enabled) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .bind(
          grant.id,
          packId,
          grant.scope,
          grant.targetId,
          grant.precedence,
          grant.enabled ? 1 : 0,
        ),
    ),
  ];
  await db.batch(statements);
  return { ok: true, grants: await listPackGrants(db, packId) };
}

export async function deleteReviewerGrants(db: D1Database, reviewerId: string): Promise<void> {
  await db
    .prepare("DELETE FROM pack_grants WHERE scope = 'reviewer' AND target_id = ?")
    .bind(reviewerId)
    .run();
}

interface KnowledgeGrantRow {
  grant_id: string;
  scope: PackGrantScope;
  target_id: string;
  precedence: number;
  pack_id: string;
  slug: string;
  name: string;
  version_id: string;
  hash: string;
  manifest_json: string;
  body: string;
  manifest_path: string;
}

export interface ResolvedKnowledge {
  byReviewer: Record<string, ResolvedPack[]>;
  notApplied: Record<string, RunNotAppliedPack[]>;
}

const SCOPE_RANK: Record<PackGrantScope, number> = {
  global: 0,
  repository: 1,
  reviewer: 2,
};

function betterGrant(
  next: { scope: PackGrantScope; precedence: number; grant_id: string },
  current: { scope: PackGrantScope; precedence: number; grant_id: string },
): boolean {
  if (next.precedence !== current.precedence) {
    return next.precedence > current.precedence;
  }
  if (SCOPE_RANK[next.scope] !== SCOPE_RANK[current.scope]) {
    return SCOPE_RANK[next.scope] > SCOPE_RANK[current.scope];
  }
  return next.grant_id > current.grant_id;
}

function compareResolved(a: ResolvedPack, b: ResolvedPack): number {
  return (
    a.precedence - b.precedence ||
    (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0) ||
    (a.versionId < b.versionId ? -1 : a.versionId > b.versionId ? 1 : 0)
  );
}

/**
 * Resolve every reviewer's effective grants to each pack's latest version. Grant precedence is
 * per grant; the most specific grant for a pack wins, and the 20-pack cap keeps the highest-
 * precedence packs. `apply: paths` is checked against the reviewer's visible changed files.
 */
export async function resolveKnowledge(
  db: D1Database,
  repoId: number,
  reviewers: { id: string }[],
  visibleByReviewer: Record<string, string[]>,
  changedFiles: string[],
): Promise<ResolvedKnowledge> {
  const byReviewer: Record<string, ResolvedPack[]> = {};
  const notApplied: Record<string, RunNotAppliedPack[]> = {};
  if (reviewers.length === 0) {
    return { byReviewer, notApplied };
  }
  const ids = [...new Set(reviewers.map((reviewer) => reviewer.id))];
  const placeholders = ids.map(() => '?').join(', ');
  const rows = await db
    .prepare(
      `SELECT g.id AS grant_id, g.scope, g.target_id, g.precedence,
              p.id AS pack_id, p.slug, p.name,
              v.id AS version_id, v.hash, v.manifest_json, v.body, v.manifest_path
       FROM pack_grants g
       JOIN packs p ON p.id = g.pack_id
       JOIN pack_versions v ON v.id = (
         SELECT id FROM pack_versions WHERE pack_id = p.id ORDER BY created_at DESC, rowid DESC LIMIT 1
       )
       WHERE g.enabled = 1
         AND (
           g.scope = 'global'
           OR (g.scope = 'repository' AND g.target_id = ?)
           OR (g.scope = 'reviewer' AND g.target_id IN (${placeholders}))
         )
       ORDER BY g.precedence ASC, p.slug ASC, g.id ASC`,
    )
    .bind(String(repoId), ...ids)
    .all<KnowledgeGrantRow>();
  const manifests = new Map<string, PackManifest | null>();
  const manifestFor = (row: KnowledgeGrantRow): PackManifest | null => {
    const cached = manifests.get(row.manifest_json);
    if (cached !== undefined) {
      return cached;
    }
    try {
      const parsed = PackManifestSchema.safeParse(JSON.parse(row.manifest_json) as unknown);
      const value = parsed.success ? parsed.data : null;
      manifests.set(row.manifest_json, value);
      return value;
    } catch {
      manifests.set(row.manifest_json, null);
      return null;
    }
  };

  for (const reviewer of reviewers) {
    const effective = new Map<string, { row: KnowledgeGrantRow; manifest: PackManifest }>();
    for (const row of rows.results) {
      const matches =
        row.scope === 'global' ||
        (row.scope === 'repository' && row.target_id === String(repoId)) ||
        (row.scope === 'reviewer' && row.target_id === reviewer.id);
      if (!matches) {
        continue;
      }
      const manifest = manifestFor(row);
      if (!manifest) {
        continue;
      }
      const current = effective.get(row.pack_id);
      if (
        !current ||
        betterGrant(
          { scope: row.scope, precedence: row.precedence, grant_id: row.grant_id },
          {
            scope: current.row.scope,
            precedence: current.row.precedence,
            grant_id: current.row.grant_id,
          },
        )
      ) {
        effective.set(row.pack_id, { row, manifest });
      }
    }

    const applied: ResolvedPack[] = [];
    const skipped: RunNotAppliedPack[] = [];
    const entries = [...effective.values()].sort((a, b) => {
      return (
        a.row.precedence - b.row.precedence ||
        (a.row.slug < b.row.slug ? -1 : a.row.slug > b.row.slug ? 1 : 0)
      );
    });
    for (const { row, manifest } of entries) {
      if (manifest.apply === 'paths') {
        const visible = visibleByReviewer[reviewer.id] ?? changedFiles;
        const matches = manifest.paths.some((pattern) =>
          visible.some((file) => globMatches(pattern, file)),
        );
        if (!matches) {
          skipped.push({
            slug: row.slug,
            hash: row.hash,
            scope: row.scope,
            precedence: row.precedence,
            reason: 'paths',
          });
          continue;
        }
      }
      applied.push({
        packId: row.pack_id,
        versionId: row.version_id,
        slug: row.slug,
        name: row.name,
        hash: row.hash,
        scope: row.scope,
        precedence: row.precedence,
        manifest,
        manifestPath: row.manifest_path,
        body: row.body,
      });
    }
    applied.sort(compareResolved);
    if (applied.length > 20) {
      const kept = [...applied]
        .sort((a, b) => {
          return (
            b.precedence - a.precedence ||
            (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0) ||
            (a.versionId < b.versionId ? -1 : a.versionId > b.versionId ? 1 : 0)
          );
        })
        .slice(0, 20)
        .sort(compareResolved);
      for (const pack of applied) {
        if (!kept.some((candidate) => candidate.versionId === pack.versionId)) {
          skipped.push({
            slug: pack.slug,
            hash: pack.hash,
            scope: pack.scope,
            precedence: pack.precedence,
            reason: 'pack-limit',
          });
        }
      }
      byReviewer[reviewer.id] = kept;
    } else {
      byReviewer[reviewer.id] = applied;
    }
    notApplied[reviewer.id] = skipped;
  }
  return { byReviewer, notApplied };
}

export async function getPackDocs(db: D1Database, versionIds: string[]): Promise<ResolvedDoc[]> {
  const unique = [...new Set(versionIds)];
  if (unique.length === 0) {
    return [];
  }
  const placeholders = unique.map(() => '?').join(', ');
  const rows = await db
    .prepare(
      `SELECT version_id, path, bytes, text, never_quote
       FROM pack_files WHERE version_id IN (${placeholders})
       ORDER BY version_id, path`,
    )
    .bind(...unique)
    .all<{
      version_id: string;
      path: string;
      bytes: number;
      text: string;
      never_quote: number;
    }>();
  return rows.results.map((row) => ({
    versionId: row.version_id,
    path: row.path,
    bytes: row.bytes,
    text: row.text,
    neverQuote: row.never_quote === 1,
  }));
}
