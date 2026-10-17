import type { InstanceReadiness, RunSummary, SessionUser } from '@jury-forge/shared';
import { PRODUCT_TAGLINE } from '@jury-forge/shared';
import { useCallback } from 'react';
import { getReadiness, listRepositories, listRuns } from '../lib/api';
import { formatRelativeTime, runStatusTone } from '../lib/format';
import { useLoadable } from '../lib/use-loadable';
import { Badge, buttonClass, Card, cx, EmptyState, focusRing, Row, Table, tapTarget } from '../ui';
import { PageError, PageLoading } from './screen-state';

interface Overview {
  readiness: InstanceReadiness;
  runs: RunSummary[];
  repos: Map<number, string>;
}

export default function HomePage({ user }: { user: SessionUser }) {
  const load = useCallback(async (): Promise<Overview> => {
    const [readiness, page, repositories] = await Promise.all([
      getReadiness(),
      listRuns(),
      listRepositories(),
    ]);
    return {
      readiness,
      runs: page.runs,
      repos: new Map(repositories.map((repository) => [repository.repoId, repository.fullName])),
    };
  }, []);
  const { data, failed, reload } = useLoadable(load);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{PRODUCT_TAGLINE}</h1>
        <p className="text-sm text-text-muted">
          Signed in as <span className="font-medium text-text">{user.login}</span> — every pull
          request on an enabled repository gets one consolidated review.
        </p>
      </header>

      {failed ? (
        <PageError
          message="The overview could not be loaded. Check the Worker and try again."
          onRetry={reload}
        />
      ) : data === null ? (
        <PageLoading />
      ) : (
        <>
          <Card title="Getting started">
            <p className="text-sm text-text-muted">
              {`${data.readiness.completed} of ${data.readiness.total} done`}
            </p>
            <div className="space-y-3 rounded-card border border-border bg-surface-muted p-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold">{data.readiness.nextStep.title}</p>
                <p className="text-sm text-text-muted">{data.readiness.nextStep.body}</p>
              </div>
              <a className={buttonClass} href={data.readiness.nextStep.href}>
                {data.readiness.nextStep.label}
              </a>
            </div>
            <ul className="space-y-2">
              {data.readiness.steps.map((step) => (
                <li key={step.key}>
                  <a
                    className={cx(
                      'flex items-center justify-between gap-3 text-sm hover:underline',
                      tapTarget,
                      focusRing,
                    )}
                    href={step.href}
                  >
                    <span>{step.label}</span>
                    <Badge tone={step.done ? 'green' : 'neutral'}>
                      {step.done ? 'Done' : 'To do'}
                    </Badge>
                  </a>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Recent runs">
            {data.runs.length === 0 ? (
              <EmptyState
                action={
                  <a className={buttonClass} href="/reviewers">
                    Create a reviewer
                  </a>
                }
                description="Runs appear here the moment a pull request arrives on an enabled repository."
                title="No runs yet"
              />
            ) : (
              <>
                <Table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                      <th className="py-2 pr-4 font-medium">Repository</th>
                      <th className="py-2 pr-4 font-medium">Pull request</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 pr-4 font-medium">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.runs.slice(0, 5).map((run) => (
                      <Row className="border-b border-border last:border-0" key={run.id}>
                        <td className="pr-4">
                          <a
                            className={cx(
                              'inline-flex items-center hover:underline',
                              tapTarget,
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
                        <td className="pr-4 text-text-muted">
                          {formatRelativeTime(run.createdAt)}
                        </td>
                      </Row>
                    ))}
                  </tbody>
                </Table>
                <div>
                  <a className={cx(buttonClass, 'mt-2')} href="/runs">
                    All runs
                  </a>
                </div>
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
