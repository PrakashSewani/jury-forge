import type { Repository, Reviewer, RunDetail, RunSummary } from '@jury-forge/shared';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRun, listRepositories, listReviewers, listRuns } from '../src/lib/api';
import RunDetailPage from '../src/pages/RunDetailPage';
import RunsPage from '../src/pages/RunsPage';

vi.mock('../src/lib/api', () => ({
  listRuns: vi.fn(),
  listRepositories: vi.fn(),
  listReviewers: vi.fn(),
  listOpenPullRequests: vi.fn(),
  startTryRun: vi.fn(),
  getRun: vi.fn(),
}));

const listRunsMock = vi.mocked(listRuns);
const listRepositoriesMock = vi.mocked(listRepositories);
const listReviewersMock = vi.mocked(listReviewers);
const getRunMock = vi.mocked(getRun);

const COMPLETED_RUN: RunSummary = {
  id: '101:12:sha:delivery',
  repoId: 101,
  prNumber: 12,
  headSha: '9f2c1a7e4b8d0f3a6c5e2b1d4a7f0c3e8b6d9a2f',
  event: 'pull_request',
  status: 'completed',
  mode: 'auto',
  error: null,
  reviewUrl: null,
  createdAt: 1_700_000_000,
  finishedAt: 1_700_000_100,
};

const RUNNING_RUN: RunSummary = {
  ...COMPLETED_RUN,
  id: '101:11:sha:delivery',
  prNumber: 11,
  status: 'running',
  finishedAt: null,
};

/** A run from the second page, so a poll tick can be caught discarding it. */
const OLDER_RUN: RunSummary = {
  ...COMPLETED_RUN,
  id: '101:10:sha:delivery',
  prNumber: 10,
};

const REPO: Repository = {
  repoId: 101,
  fullName: 'prakashsewani/jury-forge',
  private: true,
  enabled: true,
};

const REVIEWER: Reviewer = {
  id: 'rev-security',
  name: 'Security',
  instructions: 'Look for injection.',
  rules: 'Error on exploitable issues.',
  flavor: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-5',
  params: {},
  enabled: true,
  hasApiKey: true,
  repositories: ['prakashsewani/jury-forge'],
};

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RunsPage polling', () => {
  it('polls a running run and stops once the poll returns a terminal status', async () => {
    listRunsMock
      .mockResolvedValueOnce({ runs: [RUNNING_RUN], nextCursor: null })
      .mockResolvedValue({ runs: [COMPLETED_RUN], nextCursor: null });
    listRepositoriesMock.mockResolvedValue([REPO]);

    render(<RunsPage />);
    await flush();
    expect(screen.getByText('running')).toBeTruthy();
    expect(listRunsMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByText('completed')).toBeTruthy();
    expect(listRunsMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(listRunsMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the loaded pages and the paging cursor across a poll tick', async () => {
    listRunsMock
      .mockResolvedValueOnce({ runs: [RUNNING_RUN, COMPLETED_RUN], nextCursor: 'cursor-2' })
      .mockResolvedValueOnce({ runs: [OLDER_RUN], nextCursor: 'cursor-3' })
      .mockResolvedValue({ runs: [COMPLETED_RUN, RUNNING_RUN], nextCursor: 'cursor-2' });
    listRepositoriesMock.mockResolvedValue([REPO]);

    render(<RunsPage />);
    await flush();
    expect(listRepositoriesMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    });
    await flush();
    expect(listRunsMock).toHaveBeenLastCalledWith('cursor-2');
    expect(screen.getByText('#10')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    // The tick refreshed the first page in place: the page loaded with "Load more" is still there,
    // the cursor it was paging through is unchanged, and repositories were not fetched again.
    expect(screen.getByText('#10')).toBeTruthy();
    expect(listRunsMock).toHaveBeenLastCalledWith(undefined, expect.anything());
    expect(listRepositoriesMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    });
    await flush();
    expect(listRunsMock).toHaveBeenLastCalledWith('cursor-3');
  });

  it('never polls when no run is running', async () => {
    listRunsMock.mockResolvedValue({ runs: [COMPLETED_RUN], nextCursor: null });
    listRepositoriesMock.mockResolvedValue([REPO]);

    render(<RunsPage />);
    await flush();
    expect(listRunsMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(listRunsMock).toHaveBeenCalledTimes(1);
  });

  it('fetches nothing when time advances after unmount', async () => {
    listRunsMock.mockResolvedValue({ runs: [RUNNING_RUN], nextCursor: null });
    listRepositoriesMock.mockResolvedValue([REPO]);

    const { unmount } = render(<RunsPage />);
    await flush();
    expect(listRunsMock).toHaveBeenCalledTimes(1);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(listRunsMock).toHaveBeenCalledTimes(1);
  });
});

describe('RunDetailPage polling', () => {
  it('polls a running run and stops at the terminal status', async () => {
    const running: RunDetail = { run: RUNNING_RUN, reviewers: [] };
    const completed: RunDetail = { run: COMPLETED_RUN, reviewers: [] };
    getRunMock.mockResolvedValueOnce(running).mockResolvedValue(completed);
    listReviewersMock.mockResolvedValue([REVIEWER]);

    render(<RunDetailPage id="run-1" />);
    await flush();
    expect(screen.getByText('running')).toBeTruthy();
    expect(getRunMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByText('completed')).toBeTruthy();
    expect(getRunMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(getRunMock).toHaveBeenCalledTimes(2);
  });
});
