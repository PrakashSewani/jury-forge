import type { RunStatus, RunSummary } from '@jury-forge/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { listRepositories, listRuns } from '../lib/api';
import { formatRelativeTime, runStatusTone, shortSha } from '../lib/format';
import {
  Badge,
  Button,
  buttonClass,
  Card,
  cx,
  EmptyState,
  Field,
  focusRing,
  Row,
  Select,
  Table,
  Toolbar,
} from '../ui';
import { PageError, PageLoading } from './screen-state';

interface RunsData {
  runs: RunSummary[];
  nextCursor: string | null;
  repos: Map<number, string>;
}

const STATUS_OPTIONS: { value: 'all' | RunStatus; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'skipped', label: 'Skipped' },
];

export default function RunsPage() {
  const [data, setData] = useState<RunsData | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [status, setStatus] = useState<'all' | RunStatus>('all');
  const [repo, setRepo] = useState('all');

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [page, repositories] = await Promise.all([listRuns(), listRepositories()]);
      setData({
        runs: page.runs,
        nextCursor: page.nextCursor,
        repos: new Map(repositories.map((repository) => [repository.repoId, repository.fullName])),
      });
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore() {
    if (data === null || data.nextCursor === null) {
      return;
    }
    setLoadingMore(true);
    try {
      const page = await listRuns(data.nextCursor);
      setData((current) =>
        current === null
          ? current
          : { ...current, runs: [...current.runs, ...page.runs], nextCursor: page.nextCursor },
      );
    } catch {
      // Keep the current page; the button stays available for another try.
    } finally {
      setLoadingMore(false);
    }
  }

  const filtered = useMemo(() => {
    if (data === null) {
      return [];
    }
    return data.runs.filter(
      (run) =>
        (status === 'all' || run.status === status) &&
        (repo === 'all' || run.repoId === Number(repo)),
    );
  }, [data, status, repo]);

  const repoIds = data === null ? [] : [...new Set(data.runs.map((run) => run.repoId))];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Runs</h1>
      </header>
      <Card>
        {failed ? (
          <PageError
            message="The run history could not be loaded. Check the Worker and try again."
            onRetry={load}
          />
        ) : data === null ? (
          <PageLoading />
        ) : data.runs.length === 0 ? (
          <EmptyState
            action={
              <a className={buttonClass} href="/repositories">
                Enable a repository
              </a>
            }
            description="Runs appear when a pull request arrives on an enabled repository."
            title="No runs yet"
          />
        ) : (
          <>
            <Toolbar className="mb-4 flex-wrap">
              <Field className="min-w-40 flex-1 sm:max-w-56" label="Status">
                <Select
                  onChange={(event) => setStatus(event.target.value as 'all' | RunStatus)}
                  value={status}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field className="min-w-40 flex-1 sm:max-w-56" label="Repository">
                <Select onChange={(event) => setRepo(event.target.value)} value={repo}>
                  <option value="all">All repositories</option>
                  {repoIds.map((repoId) => (
                    <option key={repoId} value={String(repoId)}>
                      {data.repos.get(repoId) ?? `repo ${repoId}`}
                    </option>
                  ))}
                </Select>
              </Field>
            </Toolbar>
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-muted">
                No runs match these filters.
              </p>
            ) : (
              <Table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                    <th className="py-2 pr-4 font-medium">Repository</th>
                    <th className="py-2 pr-4 font-medium">Pull request</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Event</th>
                    <th className="py-2 pr-4 font-medium">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((run) => (
                    <Row
                      className={`border-b border-border last:border-0 ${
                        run.status === 'running' ? 'bg-surface-muted' : ''
                      }`}
                      key={run.id}
                    >
                      <td className="pr-4">
                        <a
                          className={cx(
                            'inline-flex min-h-11 items-center hover:underline',
                            focusRing,
                          )}
                          href={`/runs/${encodeURIComponent(run.id)}`}
                        >
                          {data.repos.get(run.repoId) ?? `repo ${run.repoId}`}
                        </a>
                      </td>
                      <td className="pr-4">#{run.prNumber}</td>
                      <td className="pr-4">
                        <Badge tone={runStatusTone(run.status)}>{run.status}</Badge>
                      </td>
                      <td className="pr-4 text-text-body">{run.event}</td>
                      <td className="pr-4 whitespace-nowrap text-text-muted">
                        {formatRelativeTime(run.createdAt)}
                        <span className="ml-2 text-xs">{shortSha(run.headSha)}</span>
                      </td>
                    </Row>
                  ))}
                </tbody>
              </Table>
            )}
            {data.nextCursor !== null ? (
              <div className="mt-4">
                <Button busy={loadingMore} onClick={() => void loadMore()} variant="secondary">
                  {loadingMore ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}
