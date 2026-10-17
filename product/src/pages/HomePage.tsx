import type { RunSummary, SessionUser, SetupState } from '@jury-forge/shared';
import { PRODUCT_TAGLINE } from '@jury-forge/shared';
import { useCallback } from 'react';
import { listRepositories, listRuns } from '../lib/api';
import { formatRelativeTime, runStatusTone } from '../lib/format';
import { useLoadable } from '../lib/use-loadable';
import { Badge, buttonClass, Card, cx, EmptyState, focusRing, Row, Table, tapTarget } from '../ui';
import { PageError, PageLoading } from './screen-state';

interface RecentRuns {
  runs: RunSummary[];
  repos: Map<number, string>;
}

interface NextAction {
  title: string;
  body: string;
  href: string;
  label: string;
}

function nextAction(setup: SetupState, hasRuns: boolean): NextAction {
  if (!setup.claimed) {
    return {
      title: 'Finish setting up this instance',
      body: 'Register the GitHub App, install it, and claim the instance before anything can be reviewed.',
      href: '/setup',
      label: 'Continue setup',
    };
  }
  if (!setup.installed) {
    return {
      title: 'Install the GitHub App',
      body: 'Jury Forge cannot review pull requests until the app is installed on an account.',
      href: '/setup',
      label: 'Install the app',
    };
  }
  if (!hasRuns) {
    return {
      title: 'Build your jury',
      body: 'Create a reviewer with its own instructions, rules, and model to start reviewing pull requests.',
      href: '/reviewers',
      label: 'Create a reviewer',
    };
  }
  return {
    title: 'Watch the reviews land',
    body: 'Every run is kept in history — open one to read its findings.',
    href: '/runs',
    label: 'View all runs',
  };
}

export default function HomePage({ user, setup }: { user: SessionUser; setup: SetupState }) {
  const load = useCallback(async (): Promise<RecentRuns> => {
    const [page, repositories] = await Promise.all([listRuns(), listRepositories()]);
    return {
      runs: page.runs,
      repos: new Map(repositories.map((repository) => [repository.repoId, repository.fullName])),
    };
  }, []);
  const { data, failed, reload } = useLoadable(load);
  const runs = data?.runs.slice(0, 5) ?? null;
  const next = nextAction(setup, (data?.runs.length ?? 0) > 0);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{PRODUCT_TAGLINE}</h1>
        <p className="text-sm text-text-muted">
          Signed in as <span className="font-medium text-text">{user.login}</span> — every pull
          request on an enabled repository gets one consolidated review.
        </p>
      </header>

      <Card title="Instance">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={setup.claimed ? 'green' : 'neutral'}>
            {setup.claimed ? 'Claimed' : 'Not claimed'}
          </Badge>
          <Badge tone={setup.installed ? 'green' : 'amber'}>
            {setup.installed ? 'App installed' : 'App not installed'}
          </Badge>
          {setup.appSlug ? <Badge tone="neutral">{setup.appSlug}</Badge> : null}
        </div>
        <div className="space-y-3 rounded-card border border-border bg-surface-muted p-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold">{next.title}</p>
            <p className="text-sm text-text-muted">{next.body}</p>
          </div>
          <a className={buttonClass} href={next.href}>
            {next.label}
          </a>
        </div>
      </Card>

      <Card title="Recent runs">
        {failed ? (
          <PageError
            message="The run history could not be loaded. Check the Worker and try again."
            onRetry={reload}
          />
        ) : runs === null ? (
          <PageLoading />
        ) : runs.length === 0 ? (
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
                {runs.map((run) => (
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
                        {data?.repos.get(run.repoId) ?? `repo ${run.repoId}`}
                      </a>
                    </td>
                    <td className="pr-4">#{run.prNumber}</td>
                    <td className="pr-4">
                      <Badge tone={runStatusTone(run.status)}>{run.status}</Badge>
                    </td>
                    <td className="pr-4 text-text-muted">{formatRelativeTime(run.createdAt)}</td>
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
    </div>
  );
}
