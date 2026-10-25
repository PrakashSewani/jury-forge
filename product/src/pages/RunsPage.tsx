import type {
  Repository,
  RepositoryPullRequest,
  Reviewer,
  RunStatus,
  RunSummary,
} from '@jury-forge/shared';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listOpenPullRequests,
  listRepositories,
  listReviewers,
  listRuns,
  startTryRun,
} from '../lib/api';
import { formatRelativeTime, runStatusTone, shortSha } from '../lib/format';
import { handleAppLink, navigate } from '../lib/router';
import { usePoll } from '../lib/use-poll';
import { useQueryState } from '../lib/use-query-state';
import {
  Badge,
  Button,
  buttonClass,
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
  Table,
  Toolbar,
} from '../ui';
import { errorMessage } from './messages';
import { PageError, PageLoading } from './screen-state';

interface RunsData {
  runs: RunSummary[];
  nextCursor: string | null;
  repos: Map<number, string>;
  repositories: Repository[];
}

const STATUS_OPTIONS: { value: 'all' | RunStatus; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'skipped', label: 'Skipped' },
];

function reviewerOptionSuffix(reviewer: Reviewer): string {
  if (!reviewer.enabled) {
    return ' — disabled';
  }
  if (!reviewer.hasApiKey) {
    return ' — needs a model key';
  }
  return '';
}

function TryRunDialog({
  onClose,
  repositories,
}: {
  onClose: () => void;
  repositories: Repository[];
}) {
  const [repoId, setRepoId] = useState('');
  const [prNumber, setPrNumber] = useState('');
  const [reviewerId, setReviewerId] = useState('');
  const [pullRequests, setPullRequests] = useState<RepositoryPullRequest[] | null>(null);
  const [pullRequestsLoading, setPullRequestsLoading] = useState(false);
  const [pullRequestsFailed, setPullRequestsFailed] = useState(false);
  const [reviewers, setReviewers] = useState<Reviewer[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listReviewers()
      .then((list) => {
        if (active) {
          setReviewers(list);
        }
      })
      .catch(() => {
        if (active) {
          setReviewers([]);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (reviewers === null) {
      return;
    }
    const first = reviewers.find((reviewer) => reviewer.enabled && reviewer.hasApiKey);
    setReviewerId(first === undefined ? '' : first.id);
  }, [reviewers]);

  const loadPullRequests = useCallback(async (id: number) => {
    setPullRequests(null);
    setPullRequestsFailed(false);
    setPullRequestsLoading(true);
    setPrNumber('');
    try {
      setPullRequests(await listOpenPullRequests(id));
    } catch {
      setPullRequestsFailed(true);
    } finally {
      setPullRequestsLoading(false);
    }
  }, []);

  function handleRepoChange(value: string) {
    setRepoId(value);
    if (value === '') {
      setPullRequests(null);
      setPullRequestsFailed(false);
      setPrNumber('');
      return;
    }
    void loadPullRequests(Number(value));
  }

  const canRun = repoId !== '' && prNumber !== '' && reviewerId !== '';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canRun) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await startTryRun({
        repoId: Number(repoId),
        prNumber: Number(prNumber),
        reviewerIds: [reviewerId],
      });
      navigate('/runs/' + encodeURIComponent(response.runId));
    } catch (caught) {
      setError(errorMessage(caught, 'The trial run could not be started. Try again.'));
      setBusy(false);
    }
  }

  return (
    <Dialog onClose={onClose} open title="Try a reviewer">
      <form className="mt-4 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <Notice tone="info">
          A trial run posts nothing to GitHub — the findings are recorded in Jury Forge only.
        </Notice>

        <Field label="Repository">
          <Select onChange={(event) => handleRepoChange(event.target.value)} value={repoId}>
            <option value="">Choose a repository</option>
            {repositories.map((repository) => (
              <option key={repository.repoId} value={String(repository.repoId)}>
                {repository.fullName}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Pull request">
          {repoId === '' ? (
            <Select disabled value="">
              <option value="">Choose a repository first</option>
            </Select>
          ) : (
            <Select
              disabled={pullRequestsLoading || pullRequestsFailed}
              onChange={(event) => setPrNumber(event.target.value)}
              value={prNumber}
            >
              <option value="">Choose a pull request</option>
              {(pullRequests ?? []).map((pullRequest) => (
                <option key={pullRequest.number} value={String(pullRequest.number)}>
                  {`#${pullRequest.number} — ${pullRequest.title}${
                    pullRequest.draft ? ' (draft)' : ''
                  }`}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {repoId !== '' && pullRequestsLoading ? (
          <p className="text-sm text-text-muted">Loading open pull requests…</p>
        ) : null}
        {repoId !== '' && pullRequestsFailed ? (
          <div className="space-y-2">
            <p className="text-sm text-text-muted">
              The open pull requests could not be loaded. Check the Worker and try again.
            </p>
            <Button onClick={() => void loadPullRequests(Number(repoId))} variant="secondary">
              Try again
            </Button>
          </div>
        ) : null}
        {repoId !== '' &&
        !pullRequestsLoading &&
        !pullRequestsFailed &&
        pullRequests !== null &&
        pullRequests.length === 0 ? (
          <p className="text-sm text-text-muted">This repository has no open pull requests.</p>
        ) : null}

        <Field label="Reviewer">
          <Select onChange={(event) => setReviewerId(event.target.value)} value={reviewerId}>
            {reviewers === null ? (
              <option value="">Loading reviewers…</option>
            ) : (
              reviewers.map((reviewer) => {
                const unavailable = !reviewer.enabled || !reviewer.hasApiKey;
                return (
                  <option disabled={unavailable} key={reviewer.id} value={reviewer.id}>
                    {`${reviewer.name}${reviewerOptionSuffix(reviewer)}`}
                  </option>
                );
              })
            )}
          </Select>
        </Field>

        {error ? <Notice tone="error">{error}</Notice> : null}

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button disabled={busy} onClick={onClose} variant="secondary">
            Cancel
          </Button>
          <Button busy={busy} disabled={!canRun} type="submit">
            Run trial
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function RunsPage() {
  const [data, setData] = useState<RunsData | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // The filters live in the URL, so a filtered view is a link (D-033).
  const [statusParam, setStatusParam] = useQueryState('status', 'all');
  const [repo, setRepo] = useQueryState('repo', 'all');
  const status: 'all' | RunStatus = STATUS_OPTIONS.some((option) => option.value === statusParam)
    ? (statusParam as 'all' | RunStatus)
    : 'all';
  const [tryOpen, setTryOpen] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setFailed(false);
    try {
      const [page, repositories] = await Promise.all([
        listRuns(undefined, signal),
        listRepositories(false, signal),
      ]);
      setData({
        runs: page.runs,
        nextCursor: page.nextCursor,
        repos: new Map(repositories.map((repository) => [repository.repoId, repository.fullName])),
        repositories,
      });
    } catch {
      if (!signal?.aborted) {
        setFailed(true);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hasRunning = data?.runs.some((run) => run.status === 'running') ?? false;

  /**
   * The poll tick. It refreshes the first page in place and leaves everything else alone: the pages
   * the operator loaded with "Load more", the cursor they are paging through and the repository
   * names (which do not change during a run, so the tick never refetches them). `load()` — mount and
   * an explicit retry — stays the only path that replaces the whole list.
   */
  const refresh = useCallback(async (signal: AbortSignal) => {
    try {
      const page = await listRuns(undefined, signal);
      if (signal.aborted) {
        return;
      }
      // The rows a page-1 fetch returns are the head of the list; the tail came from later pages.
      setData((current) =>
        current === null
          ? current
          : { ...current, runs: [...page.runs, ...current.runs.slice(page.runs.length)] },
      );
    } catch {
      // A failed tick changes nothing on screen; `usePoll` skips it and the next tick tries again.
    }
  }, []);

  usePoll(refresh, { intervalMs: 5000, active: hasRunning });

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

  const [queryParam, setQueryParam] = useQueryState('runq', '');
  const needle = queryParam.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (data === null) {
      return [];
    }
    return data.runs.filter(
      (run) =>
        (status === 'all' || run.status === status) &&
        (repo === 'all' || run.repoId === Number(repo)) &&
        (needle === '' ||
          `#${run.prNumber}`.includes(needle) ||
          run.headSha.toLowerCase().startsWith(needle) ||
          (data.repos.get(run.repoId) ?? '').toLowerCase().includes(needle)),
    );
  }, [data, status, repo, needle]);

  const repoIds = data === null ? [] : [...new Set(data.runs.map((run) => run.repoId))];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Runs</h1>
        <Button onClick={() => setTryOpen(true)} variant="secondary">
          Try a reviewer
        </Button>
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
              <a className={buttonClass} href="/repositories" onClick={handleAppLink}>
                Enable a repository
              </a>
            }
            description="Runs appear when a pull request arrives on an enabled repository."
            title="No runs yet"
          />
        ) : (
          <>
            <Toolbar className="mb-4 flex-wrap">
              <Field className="min-w-48 flex-[2] sm:max-w-72" label="Search">
                <Input
                  onChange={(event) => setQueryParam(event.target.value)}
                  placeholder="PR #, commit, or repository"
                  type="search"
                  value={queryParam}
                />
              </Field>
              <Field className="min-w-40 flex-1 sm:max-w-56" label="Status">
                <Select onChange={(event) => setStatusParam(event.target.value)} value={status}>
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
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-sm text-text-muted">No runs match these filters.</p>
                <Button
                  onClick={() => {
                    setQueryParam('');
                    setStatusParam('all');
                    setRepo('all');
                  }}
                  size="sm"
                  variant="secondary"
                >
                  Clear filters
                </Button>
              </div>
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
                          onClick={handleAppLink}
                        >
                          {data.repos.get(run.repoId) ?? `repo ${run.repoId}`}
                        </a>
                      </td>
                      <td className="pr-4">#{run.prNumber}</td>
                      <td className="pr-4">
                        <span className="flex flex-wrap items-center gap-2">
                          <Badge tone={runStatusTone(run.status)}>{run.status}</Badge>
                          {/* D-028: a trial posts nothing to GitHub — say so here, where the run
                              history is scanned, instead of only on the run's own page. */}
                          {run.mode === 'manual' ? <Badge tone="neutral">manual</Badge> : null}
                        </span>
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
      {tryOpen ? (
        <TryRunDialog onClose={() => setTryOpen(false)} repositories={data?.repositories ?? []} />
      ) : null}
    </div>
  );
}
