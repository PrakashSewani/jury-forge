import type {
  PackCreateResult,
  PackDetail,
  PackGrant,
  PackPreview,
  PackSummary,
} from '@jury-forge/shared';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../worker';
import { createSession } from '../worker/lib/sessions';
import { resetInstanceState } from './db';

const ORIGIN = 'https://jury-forge.test';

const MANIFEST = `---
name: Docs Style
description: House documentation conventions.
kind: skill
apply: paths
paths:
  - docs/**
never_quote:
  - docs/internal/**
owner: Docs team
---
# Documentation style

Use sentence case.
`;

const FILES = [
  { path: 'SKILL.md', text: MANIFEST },
  { path: 'docs/a.md', text: 'Alpha docs.' },
  { path: 'docs/internal/secret.md', text: 'Secret docs.' },
];

beforeEach(async () => {
  await resetInstanceState();
  await env.DB.prepare(
    "INSERT INTO repositories (repo_id, full_name, private, enabled) VALUES (101, 'octocat/hello', 0, 1)",
  ).run();
  await env.DB.prepare(
    "INSERT INTO reviewers (id, name, instructions, rules, flavor, base_url, api_key_enc, model, params_json, enabled) VALUES ('rev-1', 'Security', '', '', 'openai', 'https://api.example.com/v1', '', 'model-x', '{}', 1)",
  ).run();
});

async function session(): Promise<string> {
  const id = await createSession(env.DB, { login: 'octocat', avatarUrl: null });
  return `jf_session=${id}`;
}

async function request(
  cookie: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  return app.request(
    `${ORIGIN}/api/packs${path}`,
    {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        Origin: ORIGIN,
        Cookie: cookie,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    env,
  );
}

async function create(cookie: string, body: unknown = { files: FILES }): Promise<PackCreateResult> {
  const response = await request(cookie, 'POST', '', body);
  expect(response.status).toBe(201);
  return (await response.json()) as PackCreateResult;
}

describe('pack preview', () => {
  it('requires a session', async () => {
    const response = await app.request(`${ORIGIN}/api/packs`, {}, env);
    expect(response.status).toBe(401);
  });

  it('returns a valid manifest, hash and docs', async () => {
    const cookie = await session();
    const response = await request(cookie, 'POST', '/preview', { files: FILES });
    expect(response.status).toBe(200);
    const preview = (await response.json()) as PackPreview;
    expect(preview.valid).toBe(true);
    expect(preview.manifest?.name).toBe('Docs Style');
    expect(preview.manifest?.kind).toBe('skill');
    expect(preview.manifest?.apply).toBe('paths');
    expect(preview.manifest?.paths).toEqual(['docs/**']);
    expect(preview.manifest?.neverQuote).toEqual(['docs/internal/**']);
    expect(preview.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(preview.files).toEqual([
      { path: 'docs/a.md', bytes: 11, neverQuote: false },
      { path: 'docs/internal/secret.md', bytes: 12, neverQuote: true },
    ]);
    expect(preview.existingPack).toBeNull();
  });

  it('returns errors instead of a generic 400 for an invalid document', async () => {
    const cookie = await session();
    const response = await request(cookie, 'POST', '/preview', {
      files: [{ path: 'docs/a.md', text: 'no manifest' }],
    });
    expect(response.status).toBe(200);
    const preview = (await response.json()) as PackPreview;
    expect(preview.valid).toBe(false);
    expect(preview.errors.some((error) => error.includes('No SKILL.md'))).toBe(true);
    expect(preview.manifest).toBeNull();
  });

  it('returns root candidates for a multi-pack upload', async () => {
    const cookie = await session();
    const response = await request(cookie, 'POST', '/preview', {
      files: [
        { path: 'a/SKILL.md', text: MANIFEST.replace('Docs Style', 'A') },
        { path: 'b/SKILL.md', text: MANIFEST.replace('Docs Style', 'B') },
      ],
    });
    const preview = (await response.json()) as PackPreview;
    expect(preview.valid).toBe(false);
    expect(preview.candidates.map((candidate) => candidate.root)).toEqual(['a', 'b']);
  });

  it('reports an existing pack for a same-name upload', async () => {
    const cookie = await session();
    const created = await create(cookie);
    const response = await request(cookie, 'POST', '/preview', { files: FILES });
    const preview = (await response.json()) as PackPreview;
    expect(preview.existingPack).toEqual({
      id: created.pack.id,
      slug: 'docs-style',
      versionCount: 1,
      latestHash: created.version.hash,
    });
    expect(preview.warnings.some((warning) => warning.includes('version 2'))).toBe(true);
  });

  it('rejects invalid input and cross-origin requests', async () => {
    const cookie = await session();
    expect((await request(cookie, 'POST', '/preview', { files: [] })).status).toBe(400);
    const crossOrigin = await app.request(
      `${ORIGIN}/api/packs/preview`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://evil.test',
          Cookie: cookie,
        },
        body: JSON.stringify({ files: FILES }),
      },
      env,
    );
    expect(crossOrigin.status).toBe(403);
  });
});

describe('pack versions', () => {
  it('stores an immutable version and returns it from list and detail', async () => {
    const cookie = await session();
    const created = await create(cookie);
    expect(created.pack.slug).toBe('docs-style');
    expect(created.pack.name).toBe('Docs Style');
    expect(created.version.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(created.version.fileCount).toBe(2);
    expect(created.version.totalBytes).toBeGreaterThan(0);
    expect(created.createdVersion).toBe(true);

    const list = (await (await request(cookie, 'GET', '')).json()) as PackSummary[];
    expect(list).toHaveLength(1);
    expect(list[0]?.latest.hash).toBe(created.version.hash);
    expect(list[0]?.grantCount).toBe(0);

    const detailResponse = await request(cookie, 'GET', `/${created.pack.id}`);
    expect(detailResponse.status).toBe(200);
    const detail = (await detailResponse.json()) as PackDetail;
    expect(detail.pack.id).toBe(created.pack.id);
    expect(detail.versions).toHaveLength(1);
    expect(detail.latest.files).toEqual([
      { path: 'docs/a.md', bytes: 11, neverQuote: false },
      { path: 'docs/internal/secret.md', bytes: 12, neverQuote: true },
    ]);
    expect(detail.latest.body).toContain('Use sentence case.');

    const versionResponse = await request(
      cookie,
      'GET',
      `/${created.pack.id}/versions/${created.version.id}`,
    );
    expect(versionResponse.status).toBe(200);
    const version = (await versionResponse.json()) as {
      files: { path: string; text: string; neverQuote: boolean }[];
    };
    expect(version.files.find((file) => file.path === 'docs/a.md')?.text).toBe('Alpha docs.');
  });

  it('deduplicates identical content and creates a second version for a change', async () => {
    const cookie = await session();
    const first = await create(cookie);
    const duplicateResponse = await request(cookie, 'POST', '', { files: FILES });
    expect(duplicateResponse.status).toBe(200);
    const duplicate = (await duplicateResponse.json()) as PackCreateResult;
    expect(duplicate.createdVersion).toBe(false);
    expect(duplicate.version.id).toBe(first.version.id);

    const second = await create(cookie, {
      files: [
        { path: 'SKILL.md', text: MANIFEST },
        { path: 'docs/a.md', text: 'Alpha docs, revised.' },
        { path: 'docs/internal/secret.md', text: 'Secret docs.' },
      ],
    });
    expect(second.pack.id).toBe(first.pack.id);
    expect(second.version.id).not.toBe(first.version.id);
    expect(second.version.hash).not.toBe(first.version.hash);

    const detail = (await (await request(cookie, 'GET', `/${first.pack.id}`)).json()) as PackDetail;
    expect(detail.versions).toHaveLength(2);
    expect(detail.pack.latest.hash).toBe(second.version.hash);
  });

  it('attaches a renamed manifest to the same pack when packId is given', async () => {
    const cookie = await session();
    const first = await create(cookie);
    const renamed = await create(cookie, {
      packId: first.pack.id,
      files: [
        { path: 'SKILL.md', text: MANIFEST.replace('Docs Style', 'Docs Style v2') },
        { path: 'docs/a.md', text: 'Alpha docs.' },
      ],
    });
    expect(renamed.pack.id).toBe(first.pack.id);
    expect(renamed.pack.slug).toBe('docs-style');
    expect(renamed.pack.name).toBe('Docs Style v2');
    expect(renamed.createdVersion).toBe(true);
  });

  it('creates a separate pack with a suffixed slug when forceNew is set', async () => {
    const cookie = await session();
    await create(cookie);
    const separate = await create(cookie, { files: FILES, forceNew: true });
    expect(separate.pack.slug).toBe('docs-style-2');
    expect(separate.pack.id).not.toBe(undefined);
    const list = (await (await request(cookie, 'GET', '')).json()) as PackSummary[];
    expect(list.map((pack) => pack.slug).sort()).toEqual(['docs-style', 'docs-style-2']);
  });

  it('rejects an invalid create, a missing packId and a mixed packId/forceNew', async () => {
    const cookie = await session();
    expect(
      (await request(cookie, 'POST', '', { files: [{ path: 'nope.md', text: 'x' }] })).status,
    ).toBe(400);
    expect((await request(cookie, 'POST', '', { files: FILES, packId: 'missing' })).status).toBe(
      404,
    );
    expect(
      (await request(cookie, 'POST', '', { files: FILES, packId: 'x', forceNew: true })).status,
    ).toBe(400);
    expect((await request(cookie, 'GET', '/missing')).status).toBe(404);
    expect((await request(cookie, 'GET', '/missing/versions/nope')).status).toBe(404);
  });

  it('records a pack_version activity entry only for a new version', async () => {
    const cookie = await session();
    await create(cookie);
    await request(cookie, 'POST', '', { files: FILES });
    const rows = await env.DB.prepare(
      "SELECT target, detail FROM activity_log WHERE action = 'pack_version'",
    ).all<{ target: string; detail: string }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]?.target).toBe('docs-style');
    expect(rows.results[0]?.detail).toContain('file(s)');
  });
});

describe('pack grants', () => {
  it('replaces grants with defaults and target labels', async () => {
    const cookie = await session();
    const created = await create(cookie);
    const response = await request(cookie, 'PUT', `/${created.pack.id}/grants`, {
      grants: [
        { scope: 'global' },
        { scope: 'repository', targetId: '101' },
        { scope: 'reviewer', targetId: 'rev-1' },
      ],
    });
    expect(response.status).toBe(200);
    const grants = (await response.json()) as PackGrant[];
    expect(grants).toEqual([
      {
        id: expect.any(String),
        scope: 'global',
        targetId: null,
        targetLabel: null,
        precedence: 100,
        enabled: true,
      },
      {
        id: expect.any(String),
        scope: 'repository',
        targetId: '101',
        targetLabel: 'octocat/hello',
        precedence: 200,
        enabled: true,
      },
      {
        id: expect.any(String),
        scope: 'reviewer',
        targetId: 'rev-1',
        targetLabel: 'Security',
        precedence: 300,
        enabled: true,
      },
    ]);

    const detail = (await (
      await request(cookie, 'GET', `/${created.pack.id}`)
    ).json()) as PackDetail;
    expect(detail.pack.grantCount).toBe(3);
    expect(detail.grants).toHaveLength(3);
  });

  it('honours explicit precedence and enabled flags, and clears with an empty list', async () => {
    const cookie = await session();
    const created = await create(cookie);
    const response = await request(cookie, 'PUT', `/${created.pack.id}/grants`, {
      grants: [{ scope: 'global', precedence: 7, enabled: false }],
    });
    const grants = (await response.json()) as PackGrant[];
    expect(grants[0]).toMatchObject({ precedence: 7, enabled: false });

    const cleared = await request(cookie, 'PUT', `/${created.pack.id}/grants`, { grants: [] });
    await expect(cleared.json()).resolves.toEqual([]);
  });

  it('rejects an unknown target, a duplicate and a global target', async () => {
    const cookie = await session();
    const created = await create(cookie);
    const invalid = [
      { grants: [{ scope: 'repository', targetId: '999' }] },
      { grants: [{ scope: 'reviewer', targetId: 'missing' }] },
      { grants: [{ scope: 'global' }, { scope: 'global' }] },
      { grants: [{ scope: 'global', targetId: '101' }] },
      { grants: [{ scope: 'repository' }] },
    ];
    for (const body of invalid) {
      const response = await request(cookie, 'PUT', `/${created.pack.id}/grants`, body);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'invalid_request' });
    }
  });

  it('removes reviewer-scoped grants when the reviewer is deleted', async () => {
    const cookie = await session();
    const created = await create(cookie);
    await request(cookie, 'PUT', `/${created.pack.id}/grants`, {
      grants: [{ scope: 'reviewer', targetId: 'rev-1' }],
    });
    const deleted = await app.request(
      `${ORIGIN}/api/reviewers/rev-1`,
      { method: 'DELETE', headers: { Origin: ORIGIN, Cookie: cookie } },
      env,
    );
    expect(deleted.status).toBe(204);
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM pack_grants WHERE scope = 'reviewer' AND target_id = 'rev-1'",
    ).first<{ count: number }>();
    expect(count?.count).toBe(0);
  });

  it('records a pack_grants activity entry', async () => {
    const cookie = await session();
    const created = await create(cookie);
    await request(cookie, 'PUT', `/${created.pack.id}/grants`, {
      grants: [{ scope: 'global' }, { scope: 'reviewer', targetId: 'rev-1' }],
    });
    const row = await env.DB.prepare(
      "SELECT target, detail FROM activity_log WHERE action = 'pack_grants'",
    ).first<{ target: string; detail: string }>();
    expect(row?.target).toBe('docs-style');
    expect(row?.detail).toContain('global');
    expect(row?.detail).toContain('Security');
  });
});
