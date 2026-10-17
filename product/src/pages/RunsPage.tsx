import type { RunSummary } from '@jury-forge/shared';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Card, LoadFailed, Loading, secondaryButtonClass } from '../components';
import { listRepositories, listRuns } from '../lib/api';
import { formatTime, runStatusTone, shortSha } from '../lib/format';

interface RunsData {
  runs: RunSummary[];
  nextCursor: string | null;
  repos: Map<number, string>;
}

export default function RunsPage() {
  const [data, setData] = useState<RunsData | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

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

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Runs</h1>
      </header>
      <Card>
        {failed ? (
          <LoadFailed onRetry={load} />
        ) : data === null ? (
          <Loading />
        ) : data.runs.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No runs yet — they appear when a pull request arrives.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-neutral-100">
              {data.runs.map((run) => (
                <li key={run.id}>
                  <a
                    className="flex items-center justify-between gap-4 py-3 transition hover:bg-neutral-50"
                    href={`/runs/${encodeURIComponent(run.id)}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {data.repos.get(run.repoId) ?? `repo ${run.repoId}`} · #{run.prNumber}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {shortSha(run.headSha)} · {formatTime(run.createdAt)}
                      </p>
                    </div>
                    <Badge tone={runStatusTone(run.status)}>{run.status}</Badge>
                  </a>
                </li>
              ))}
            </ul>
            {data.nextCursor !== null ? (
              <button
                className={secondaryButtonClass}
                disabled={loadingMore}
                onClick={() => void loadMore()}
                type="button"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}
