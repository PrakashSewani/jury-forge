import type { Repository, RepositoryReviewer } from '@jury-forge/shared';
import { useCallback, useState } from 'react';
import { Badge, Card, LoadFailed, Loading, Notice, secondaryButtonClass } from '../components';
import {
  getRepositoryReviewers,
  listRepositories,
  saveRepositoryReviewers,
  setRepositoryEnabled,
} from '../lib/api';
import { useLoadable } from '../lib/use-loadable';

export default function RepositoriesPage() {
  const load = useCallback(() => listRepositories(), []);
  const { data, failed, reload } = useLoadable(load);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      await listRepositories(true);
      await reload();
    } catch {
      setRefreshError('GitHub did not answer the refresh — check the installation and try again.');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Repositories</h1>
        <button
          className={secondaryButtonClass}
          disabled={refreshing}
          onClick={() => void handleRefresh()}
          type="button"
        >
          {refreshing ? 'Refreshing…' : 'Refresh from GitHub'}
        </button>
      </header>
      {refreshError ? <Notice tone="error">{refreshError}</Notice> : null}
      {failed ? (
        <Card>
          <LoadFailed onRetry={reload} />
        </Card>
      ) : data === null ? (
        <Loading />
      ) : data.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-500">
            No repositories yet — refresh from GitHub to import the installation&rsquo;s
            repositories, then enable the ones that should get reviews.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.map((repository) => (
            <RepositoryRow key={repository.repoId} repository={repository} onChanged={reload} />
          ))}
        </div>
      )}
    </div>
  );
}

function RepositoryRow({
  repository,
  onChanged,
}: {
  repository: Repository;
  onChanged: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [reviewers, setReviewers] = useState<RepositoryReviewer[] | null>(null);
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [reviewersError, setReviewersError] = useState<string | null>(null);
  const [savingReviewers, setSavingReviewers] = useState(false);

  async function toggleEnabled(enabled: boolean) {
    setSaving(true);
    setError(null);
    try {
      await setRepositoryEnabled(repository.repoId, enabled);
      await onChanged();
    } catch {
      setError('Could not update the repository.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    if (next && reviewers === null) {
      try {
        const list = await getRepositoryReviewers(repository.repoId);
        setReviewers(list);
        setDraft(Object.fromEntries(list.map((entry) => [entry.reviewerId, entry.enabled])));
      } catch {
        setReviewersError('Could not load the reviewer toggles.');
      }
    }
  }

  async function saveReviewers() {
    if (reviewers === null) {
      return;
    }
    setSavingReviewers(true);
    setReviewersError(null);
    try {
      const updated = await saveRepositoryReviewers(
        repository.repoId,
        reviewers.map((entry) => ({
          reviewerId: entry.reviewerId,
          enabled: draft[entry.reviewerId] ?? entry.enabled,
        })),
      );
      setReviewers(updated);
      setDraft(Object.fromEntries(updated.map((entry) => [entry.reviewerId, entry.enabled])));
    } catch {
      setReviewersError('Could not save the reviewer toggles.');
    } finally {
      setSavingReviewers(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            {repository.fullName}
            {repository.private ? <Badge>private</Badge> : null}
          </p>
          <p className="text-xs text-neutral-500">repo {repository.repoId}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              checked={repository.enabled}
              disabled={saving}
              onChange={(event) => void toggleEnabled(event.target.checked)}
              type="checkbox"
            />
            {repository.enabled ? 'Enabled' : 'Disabled'}
          </label>
          <button
            className="text-xs text-neutral-500 underline transition hover:text-neutral-900"
            onClick={() => void toggleExpanded()}
            type="button"
          >
            {expanded ? 'Hide reviewers' : 'Reviewers'}
          </button>
        </div>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {expanded ? (
        <div className="space-y-3 border-t border-neutral-100 pt-3">
          {reviewersError ? <Notice tone="error">{reviewersError}</Notice> : null}
          {reviewers === null ? (
            <Loading label="Loading reviewers…" />
          ) : reviewers.length === 0 ? (
            <p className="text-sm text-neutral-500">No reviewers exist yet.</p>
          ) : (
            <>
              <ul className="space-y-2">
                {reviewers.map((entry) => (
                  <li key={entry.reviewerId}>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        checked={draft[entry.reviewerId] ?? entry.enabled}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            [entry.reviewerId]: event.target.checked,
                          }))
                        }
                        type="checkbox"
                      />
                      {entry.name}
                    </label>
                  </li>
                ))}
              </ul>
              <button
                className={secondaryButtonClass}
                disabled={savingReviewers}
                onClick={() => void saveReviewers()}
                type="button"
              >
                {savingReviewers ? 'Saving…' : 'Save reviewer toggles'}
              </button>
            </>
          )}
        </div>
      ) : null}
    </Card>
  );
}
