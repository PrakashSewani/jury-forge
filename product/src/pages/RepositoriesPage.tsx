import type { Repository, RepositoryReviewer } from '@jury-forge/shared';
import { Fragment, useCallback, useState } from 'react';
import {
  getRepositoryReviewers,
  listRepositories,
  saveRepositoryReviewers,
  setRepositoryEnabled,
} from '../lib/api';
import { useLoadable } from '../lib/use-loadable';
import { Badge, Button, Card, EmptyState, Notice, Row, Switch, Table } from '../ui';
import { errorMessage } from './messages';
import { PageError, PageLoading } from './screen-state';

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
    } catch (caught) {
      setRefreshError(
        errorMessage(
          caught,
          'GitHub did not answer the refresh — check the installation and try again.',
        ),
      );
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Repositories</h1>
        <Button busy={refreshing} onClick={() => void handleRefresh()} variant="secondary">
          {refreshing ? 'Refreshing…' : 'Refresh from GitHub'}
        </Button>
      </header>
      {refreshError ? <Notice tone="error">{refreshError}</Notice> : null}
      {failed ? (
        <PageError
          message="The repository list could not be loaded. Check the Worker and try again."
          onRetry={reload}
        />
      ) : data === null ? (
        <PageLoading />
      ) : data.length === 0 ? (
        <EmptyState
          action={
            <Button busy={refreshing} onClick={() => void handleRefresh()}>
              Refresh from GitHub
            </Button>
          }
          description="Refresh from GitHub to import the installation's repositories, then enable the ones that should get reviews."
          title="No repositories yet"
        />
      ) : (
        <Card>
          <Table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                <th className="py-2 pr-4 font-medium">Repository</th>
                <th className="py-2 pr-4 font-medium">Enabled</th>
                <th className="py-2 pr-4 font-medium">Reviewers</th>
              </tr>
            </thead>
            <tbody>
              {data.map((repository) => (
                <RepositoryRows
                  key={repository.repoId}
                  onChanged={reload}
                  repository={repository}
                />
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function RepositoryRows({
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
    } catch (caught) {
      setError(errorMessage(caught, 'Could not update the repository. Try again.'));
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
      } catch (caught) {
        setReviewersError(errorMessage(caught, 'Could not load the reviewer toggles. Try again.'));
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
    } catch (caught) {
      setReviewersError(errorMessage(caught, 'Could not save the reviewer toggles. Try again.'));
    } finally {
      setSavingReviewers(false);
    }
  }

  return (
    <Fragment>
      <Row className="border-b border-border">
        <td className="py-1 pr-4">
          <div className="flex flex-wrap items-center gap-2 py-1">
            <span className="font-medium">{repository.fullName}</span>
            {repository.private ? <Badge tone="neutral">private</Badge> : null}
          </div>
          <p className="text-xs text-text-muted">repo {repository.repoId}</p>
        </td>
        <td className="py-1 pr-4">
          <Switch
            checked={repository.enabled}
            label={repository.enabled ? 'Enabled' : 'Disabled'}
            onCheckedChange={(enabled) => void toggleEnabled(enabled)}
          />
        </td>
        <td className="py-1 pr-4">
          <Button
            aria-expanded={expanded}
            disabled={saving}
            onClick={() => void toggleExpanded()}
            size="sm"
            variant="secondary"
          >
            {expanded ? 'Hide reviewers' : 'Manage reviewers'}
          </Button>
        </td>
      </Row>
      {error ? (
        <Row>
          <td className="pb-3" colSpan={3}>
            <Notice tone="error">{error}</Notice>
          </td>
        </Row>
      ) : null}
      {expanded ? (
        <Row className="border-b border-border last:border-0">
          <td className="bg-surface-muted p-4" colSpan={3}>
            <div className="space-y-3">
              {reviewersError ? <Notice tone="error">{reviewersError}</Notice> : null}
              {reviewers === null ? (
                <PageLoading label="Loading reviewers…" />
              ) : reviewers.length === 0 ? (
                <p className="text-sm text-text-muted">
                  No reviewers exist yet — create one on the Reviewers page.
                </p>
              ) : (
                <>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {reviewers.map((entry) => (
                      <li key={entry.reviewerId}>
                        <Switch
                          checked={draft[entry.reviewerId] ?? entry.enabled}
                          label={entry.name}
                          onCheckedChange={(checked) =>
                            setDraft((current) => ({
                              ...current,
                              [entry.reviewerId]: checked,
                            }))
                          }
                        />
                      </li>
                    ))}
                  </ul>
                  <Button
                    busy={savingReviewers}
                    onClick={() => void saveReviewers()}
                    variant="secondary"
                  >
                    {savingReviewers ? 'Saving…' : 'Save reviewer toggles'}
                  </Button>
                </>
              )}
            </div>
          </td>
        </Row>
      ) : null}
    </Fragment>
  );
}
