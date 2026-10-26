import type {
  PackGrant,
  PackGrantInput,
  PackGrantScope,
  PackVersionDetail,
} from '@jury-forge/shared';
import { PackDetailSchema, RepositorySchema, ReviewerSchema } from '@jury-forge/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  getPack,
  getPackVersion,
  listRepositories,
  listReviewers,
  savePackGrants,
} from '../lib/api';
import { formatBytes, formatRelativeTime, formatTime, shortSha } from '../lib/format';
import { handleAppLink } from '../lib/router';
import { useResource } from '../lib/use-resource';
import {
  Badge,
  Button,
  Card,
  cx,
  Dialog,
  EmptyState,
  Field,
  focusRing,
  Input,
  Notice,
  Row,
  Select,
  Switch,
  Table,
  tapTarget,
} from '../ui';
import { errorMessage } from './messages';
import { PackUploadDialog } from './PackUploadDialog';
import { PageError, PageLoading } from './screen-state';

const DetailDataSchema = z.object({
  detail: PackDetailSchema,
  repositories: z.array(RepositorySchema),
  reviewers: z.array(ReviewerSchema),
});

type DetailData = z.infer<typeof DetailDataSchema>;

interface GrantDraft {
  key: string;
  scope: PackGrantScope;
  targetId: string | null;
  precedence: number;
  enabled: boolean;
}

const DEFAULT_PRECEDENCE: Record<PackGrantScope, number> = {
  global: 100,
  repository: 200,
  reviewer: 300,
};

function draftKey(scope: PackGrantScope, targetId: string | null): string {
  return `${scope}:${targetId ?? ''}`;
}

function draftFrom(grants: PackGrant[]): GrantDraft[] {
  return grants.map((grant) => ({
    key: draftKey(grant.scope, grant.targetId),
    scope: grant.scope,
    targetId: grant.targetId,
    precedence: grant.precedence,
    enabled: grant.enabled,
  }));
}

function inputFrom(draft: GrantDraft[]): PackGrantInput[] {
  return draft.map((grant) => ({
    scope: grant.scope,
    targetId: grant.scope === 'global' ? null : grant.targetId,
    precedence: grant.precedence,
    enabled: grant.enabled,
  }));
}

export default function PackDetailPage({ id }: { id: string }) {
  const load = useCallback(
    async (signal: AbortSignal): Promise<DetailData> => {
      const [detail, repositories, reviewers] = await Promise.all([
        getPack(id, signal),
        listRepositories(false, signal),
        listReviewers(signal),
      ]);
      return { detail, repositories, reviewers };
    },
    [id],
  );
  const { data, failed, reload } = useResource(DetailDataSchema, load);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [draft, setDraft] = useState<GrantDraft[]>([]);
  const [serverGrants, setServerGrants] = useState<GrantDraft[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [version, setVersion] = useState<PackVersionDetail | null>(null);
  const [versionError, setVersionError] = useState<string | null>(null);
  const [versionBusy, setVersionBusy] = useState(false);

  useEffect(() => {
    if (!data || loadedFor === data.detail.pack.id) {
      return;
    }
    const next = draftFrom(data.detail.grants);
    setLoadedFor(data.detail.pack.id);
    setDraft(next);
    setServerGrants(next);
    setDirty(false);
  }, [data, loadedFor]);

  const repoNames = useMemo(
    () => new Map((data?.repositories ?? []).map((repo) => [String(repo.repoId), repo.fullName])),
    [data],
  );
  const reviewerNames = useMemo(
    () => new Map((data?.reviewers ?? []).map((reviewer) => [reviewer.id, reviewer.name])),
    [data],
  );

  function updateDraft(next: GrantDraft[]) {
    setDraft(next);
    setDirty(true);
    setGrantError(null);
  }

  function addGrant(scope: PackGrantScope, targetId: string | null) {
    if (draft.some((grant) => grant.scope === scope && grant.targetId === targetId)) {
      return;
    }
    updateDraft([
      ...draft,
      {
        key: draftKey(scope, targetId),
        scope,
        targetId,
        precedence: DEFAULT_PRECEDENCE[scope],
        enabled: true,
      },
    ]);
  }

  function removeGrant(key: string) {
    updateDraft(draft.filter((grant) => grant.key !== key));
  }

  function patchGrant(key: string, patch: Partial<GrantDraft>) {
    updateDraft(draft.map((grant) => (grant.key === key ? { ...grant, ...patch } : grant)));
  }

  async function saveGrants() {
    setSaving(true);
    setGrantError(null);
    try {
      const saved = await savePackGrants(id, inputFrom(draft));
      const next = draftFrom(saved);
      setDraft(next);
      setServerGrants(next);
      setDirty(false);
      toast.success('Grants saved');
      void reload();
    } catch (caught) {
      setGrantError(
        errorMessage(caught, 'Could not save the grants. Check the targets and try again.'),
      );
    } finally {
      setSaving(false);
    }
  }

  async function openVersion(next: string) {
    setVersionId(next);
    setVersion(null);
    setVersionError(null);
    setVersionBusy(true);
    try {
      setVersion(await getPackVersion(id, next));
    } catch (caught) {
      setVersionError(errorMessage(caught, 'That version could not be loaded.'));
    } finally {
      setVersionBusy(false);
    }
  }

  function closeVersion() {
    setVersionId(null);
    setVersion(null);
    setVersionError(null);
  }

  if (failed) {
    return (
      <PageError
        message="This knowledge pack could not be loaded. It may have been removed, or the API did not answer."
        onRetry={reload}
      />
    );
  }
  if (data === null) {
    return <PageLoading />;
  }

  const { pack, versions, latest } = data.detail;
  const usedRepos = new Set(
    draft.filter((grant) => grant.scope === 'repository').map((grant) => grant.targetId ?? ''),
  );
  const usedReviewers = new Set(
    draft.filter((grant) => grant.scope === 'reviewer').map((grant) => grant.targetId ?? ''),
  );
  const hasGlobal = draft.some((grant) => grant.scope === 'global');
  const nextRepo = data.repositories.find((repo) => !usedRepos.has(String(repo.repoId)));
  const nextReviewer = data.reviewers.find((reviewer) => !usedReviewers.has(reviewer.id));
  const selectedVersion = versions.find((entry) => entry.id === versionId);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{pack.name}</h1>
            <Badge tone="neutral">{latest.manifest.kind}</Badge>
            <span className="font-mono text-xs text-text-muted">
              {pack.slug}@{shortSha(latest.hash)}
            </span>
          </div>
          <p className="max-w-2xl text-sm text-text-muted">{latest.manifest.description}</p>
          <p className="text-xs text-text-muted">
            {versions.length} version(s) · latest {formatRelativeTime(latest.createdAt)} ·{' '}
            {pack.grantCount} grant(s)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            className={cx(
              'inline-flex items-center text-sm text-text-muted hover:text-text',
              tapTarget,
              focusRing,
            )}
            href="/packs"
            onClick={handleAppLink}
          >
            ← All packs
          </a>
          <Button onClick={() => setUploadOpen(true)} variant="secondary">
            Upload a new version
          </Button>
        </div>
      </header>

      <Card title="Manifest">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-text-muted">Owner</dt>
            <dd>{latest.manifest.owner || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Applies</dt>
            <dd>
              {latest.manifest.apply === 'paths'
                ? `when changed files match ${latest.manifest.paths.join(', ')}`
                : 'always (when granted)'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">never_quote</dt>
            <dd className="font-mono text-xs">
              {latest.manifest.neverQuote.length ? latest.manifest.neverQuote.join(', ') : 'none'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Manifest file</dt>
            <dd className="font-mono text-xs">{latest.manifestPath}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Manifest bytes</dt>
            <dd>{formatBytes(latest.manifestBytes)}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Stored size</dt>
            <dd>
              {formatBytes(latest.totalBytes)} · {latest.fileCount} docs
            </dd>
          </div>
        </dl>
        {latest.body.trim() === '' ? (
          <p className="mt-3 text-sm text-text-muted">The manifest body is empty.</p>
        ) : (
          <details className="mt-4">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">
              Manifest body
            </summary>
            <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-control border border-border bg-surface-muted p-3 text-xs">
              {latest.body}
            </pre>
          </details>
        )}
      </Card>

      <Card title="docs/ files">
        {latest.files.length === 0 ? (
          <EmptyState
            description="Only the manifest and its body are injected for this pack."
            title="No docs/ files"
          />
        ) : (
          <Table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                <th className="py-2 pr-4 font-medium">Path</th>
                <th className="py-2 pr-4 font-medium">Bytes</th>
                <th className="py-2 pr-4 font-medium">Injection</th>
              </tr>
            </thead>
            <tbody>
              {latest.files.map((file) => (
                <Row className="border-b border-border last:border-0" key={file.path}>
                  <td className="py-1 pr-4 font-mono text-xs">{file.path}</td>
                  <td className="py-1 pr-4 text-xs">{formatBytes(file.bytes)}</td>
                  <td className="py-1 pr-4">
                    <Badge tone={file.neverQuote ? 'amber' : 'green'}>
                      {file.neverQuote ? 'withheld' : 'included'}
                    </Badge>
                  </td>
                </Row>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title="Versions">
        <Table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
              <th className="py-2 pr-4 font-medium">Version</th>
              <th className="py-2 pr-4 font-medium">Stored</th>
              <th className="py-2 pr-4 font-medium">Uploaded</th>
              <th className="py-2 pr-4 font-medium">By</th>
              <th className="py-2 pr-4 font-medium" />
            </tr>
          </thead>
          <tbody>
            {versions.map((entry) => (
              <Row className="border-b border-border last:border-0" key={entry.id}>
                <td className="py-2 pr-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs" title={entry.hash}>
                      @{shortSha(entry.hash)}
                    </span>
                    {entry.id === latest.id ? <Badge tone="green">latest</Badge> : null}
                  </div>
                </td>
                <td className="py-2 pr-4 text-xs">
                  {formatBytes(entry.totalBytes)} · {entry.fileCount} docs
                </td>
                <td className="py-2 pr-4 text-xs text-text-muted">
                  {formatRelativeTime(entry.createdAt)}
                </td>
                <td className="py-2 pr-4 text-xs text-text-muted">{entry.createdBy ?? '—'}</td>
                <td className="py-2 pr-4 text-right">
                  <Button onClick={() => void openVersion(entry.id)} size="sm" variant="secondary">
                    View
                  </Button>
                </td>
              </Row>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card title="Grants">
        <p className="text-sm text-text-muted">
          A pack is stored without effect until it is granted. Lower order runs earlier; the
          defaults are global 100, repository 200, reviewer 300. A run records whichever version it
          used.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            disabled={hasGlobal}
            onClick={() => addGrant('global', null)}
            size="sm"
            variant="secondary"
          >
            Add global
          </Button>
          <Button
            disabled={nextRepo === undefined}
            onClick={() => addGrant('repository', String(nextRepo?.repoId ?? ''))}
            size="sm"
            variant="secondary"
          >
            Add repository
          </Button>
          <Button
            disabled={nextReviewer === undefined}
            onClick={() => addGrant('reviewer', nextReviewer?.id ?? '')}
            size="sm"
            variant="secondary"
          >
            Add reviewer
          </Button>
        </div>

        {draft.length === 0 ? (
          <p className="mt-4 text-sm text-text-muted">
            No grants yet — this pack will not reach any reviewer.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {draft.map((grant) => (
              <li
                className="grid gap-3 rounded-control border border-border p-3 sm:grid-cols-[1fr_7rem_auto_auto] sm:items-center"
                key={grant.key}
              >
                <div className="min-w-0">
                  <Badge tone="neutral">{grant.scope}</Badge>
                  {grant.scope === 'global' ? (
                    <span className="ml-2 text-sm">Every repository and reviewer</span>
                  ) : grant.scope === 'repository' ? (
                    <Select
                      aria-label="Repository"
                      className="mt-2"
                      onChange={(event) => patchGrant(grant.key, { targetId: event.target.value })}
                      value={grant.targetId ?? ''}
                    >
                      {!repoNames.has(grant.targetId ?? '') ? (
                        <option value={grant.targetId ?? ''}>
                          Missing repository {grant.targetId}
                        </option>
                      ) : null}
                      {data.repositories.map((repo) => (
                        <option key={repo.repoId} value={String(repo.repoId)}>
                          {repo.fullName}
                          {repo.enabled ? '' : ' (disabled)'}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Select
                      aria-label="Reviewer"
                      className="mt-2"
                      onChange={(event) => patchGrant(grant.key, { targetId: event.target.value })}
                      value={grant.targetId ?? ''}
                    >
                      {!reviewerNames.has(grant.targetId ?? '') ? (
                        <option value={grant.targetId ?? ''}>
                          Missing reviewer {grant.targetId}
                        </option>
                      ) : null}
                      {data.reviewers.map((reviewer) => (
                        <option key={reviewer.id} value={reviewer.id}>
                          {reviewer.name}
                          {reviewer.enabled ? '' : ' (disabled)'}
                        </option>
                      ))}
                    </Select>
                  )}
                </div>
                <Field label="Order">
                  <Input
                    max={1_000}
                    min={0}
                    onChange={(event) =>
                      patchGrant(grant.key, {
                        precedence: Number.isFinite(Number(event.target.value))
                          ? Number(event.target.value)
                          : 0,
                      })
                    }
                    type="number"
                    value={grant.precedence}
                  />
                </Field>
                <Switch
                  checked={grant.enabled}
                  label="Enabled"
                  onCheckedChange={(enabled) => patchGrant(grant.key, { enabled })}
                />
                <Button onClick={() => removeGrant(grant.key)} size="sm" variant="ghost">
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}

        {grantError ? <Notice tone="error">{grantError}</Notice> : null}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button busy={saving} disabled={!dirty} onClick={() => void saveGrants()}>
            Save grants
          </Button>
          <Button
            disabled={!dirty || saving}
            onClick={() => {
              setDraft(serverGrants);
              setDirty(false);
              setGrantError(null);
            }}
            variant="secondary"
          >
            Discard changes
          </Button>
          <span className="text-xs text-text-muted">
            {dirty ? 'Unsaved changes' : 'All changes saved'}
          </span>
        </div>
      </Card>

      <PackUploadDialog
        onClose={() => setUploadOpen(false)}
        onCreated={(result) => {
          toast.success(`Stored ${result.pack.slug}@${shortSha(result.version.hash)}`);
          void reload();
        }}
        open={uploadOpen}
        packId={id}
        packSlug={pack.slug}
      />

      <Dialog
        description={
          version === null
            ? 'Loading this version…'
            : `${version.hash} · uploaded ${formatTime(version.createdAt)}`
        }
        onClose={closeVersion}
        open={versionId !== null}
        title={`Version @${selectedVersion === undefined ? '' : shortSha(selectedVersion.hash)}`}
      >
        <div className="mt-4 max-h-[65vh] space-y-3 overflow-y-auto pr-1">
          {versionError ? <Notice tone="error">{versionError}</Notice> : null}
          {versionBusy && version === null ? <PageLoading label="Loading version…" /> : null}
          {version !== null ? (
            <>
              <div className="rounded-control border border-border bg-surface-muted p-3 text-sm">
                <p className="font-medium">{version.manifest.name}</p>
                <p className="mt-1 text-text-body">{version.manifest.description}</p>
                <p className="mt-2 text-xs text-text-muted">
                  {version.fileCount} docs · {formatBytes(version.totalBytes)} · never_quote{' '}
                  {version.manifest.neverQuote.join(', ') || 'none'}
                </p>
              </div>
              {version.files.length === 0 ? (
                <p className="text-sm text-text-muted">No docs/ files in this version.</p>
              ) : (
                version.files.map((file) => (
                  <details className="rounded-control border border-border" key={file.path}>
                    <summary className="flex min-h-11 cursor-pointer items-center px-3 py-2 text-sm">
                      <span className="font-mono text-xs">{file.path}</span>
                      <span className="ml-2 text-xs text-text-muted">
                        {formatBytes(file.bytes)}
                        {file.neverQuote ? ' · withheld' : ''}
                      </span>
                    </summary>
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap border-t border-border p-3 text-xs">
                      {file.text}
                    </pre>
                  </details>
                ))
              )}
            </>
          ) : null}
        </div>
      </Dialog>
    </div>
  );
}
