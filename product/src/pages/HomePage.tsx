import type { SessionUser } from '@jury-forge/shared';
import { PRODUCT_TAGLINE } from '@jury-forge/shared';
import { useCallback } from 'react';
import { Badge, Card, LoadFailed, Loading } from '../components';
import { listRuns } from '../lib/api';
import { formatTime, runStatusTone } from '../lib/format';
import { useLoadable } from '../lib/use-loadable';

export default function HomePage({ user }: { user: SessionUser }) {
  const load = useCallback(() => listRuns(), []);
  const { data, failed, reload } = useLoadable(load);
  const runs = data?.runs.slice(0, 5) ?? null;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{PRODUCT_TAGLINE}</h1>
        <p className="text-sm text-neutral-500">
          Signed in as <span className="font-medium text-neutral-700">{user.login}</span> — every
          pull request on an enabled repository gets one consolidated review.
        </p>
      </header>
      <Card title="Recent runs">
        {failed ? (
          <LoadFailed onRetry={reload} />
        ) : runs === null ? (
          <Loading />
        ) : runs.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No runs yet — they appear when a pull request arrives on an enabled repository.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-neutral-100">
              {runs.map((run) => (
                <li key={run.id}>
                  <a
                    className="flex items-center justify-between gap-4 py-3 transition hover:bg-neutral-50"
                    href={`/runs/${encodeURIComponent(run.id)}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        repo {run.repoId} · pull request #{run.prNumber}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {run.event} · {formatTime(run.createdAt)}
                      </p>
                    </div>
                    <Badge tone={runStatusTone(run.status)}>{run.status}</Badge>
                  </a>
                </li>
              ))}
            </ul>
            <a className="text-sm text-neutral-500 transition hover:text-neutral-900" href="/runs">
              All runs →
            </a>
          </>
        )}
      </Card>
      <Card title="Getting started">
        <ul className="space-y-1 text-sm text-neutral-600">
          <li>
            <a className="underline-offset-4 hover:underline" href="/reviewers">
              Reviewers
            </a>{' '}
            — build your jury: instructions, rules, and a model per reviewer.
          </li>
          <li>
            <a className="underline-offset-4 hover:underline" href="/repositories">
              Repositories
            </a>{' '}
            — enable the repos that should get reviews.
          </li>
          <li>
            <a className="underline-offset-4 hover:underline" href="/runs">
              Runs
            </a>{' '}
            — every review, with per-reviewer outcomes.
          </li>
        </ul>
      </Card>
    </div>
  );
}
