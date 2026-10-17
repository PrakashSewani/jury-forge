import type { InstanceReadiness, SetupState } from '@jury-forge/shared';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import {
  fetchSession,
  fetchSetupState,
  getReadiness,
  listActivity,
  listRepositories,
  listReviewers,
  listRuns,
} from '../src/lib/api';
import { navigate } from '../src/lib/router';

vi.mock('../src/lib/api', () => ({
  fetchSession: vi.fn(),
  fetchSetupState: vi.fn(),
  logOut: vi.fn(),
  getReadiness: vi.fn(),
  listRuns: vi.fn(),
  listRepositories: vi.fn(),
  listReviewers: vi.fn(),
  getReviewer: vi.fn(),
  createReviewer: vi.fn(),
  updateReviewer: vi.fn(),
  deleteReviewer: vi.fn(),
  getRepositoryReviewers: vi.fn(),
  saveRepositoryReviewers: vi.fn(),
  setRepositoryEnabled: vi.fn(),
  getRun: vi.fn(),
  listOpenPullRequests: vi.fn(),
  startTryRun: vi.fn(),
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  listActivity: vi.fn(),
  exportReviewers: vi.fn(),
  importReviewers: vi.fn(),
  downloadReviewersExport: vi.fn(),
}));

const fetchSessionMock = vi.mocked(fetchSession);
const fetchSetupStateMock = vi.mocked(fetchSetupState);
const getReadinessMock = vi.mocked(getReadiness);
const listRunsMock = vi.mocked(listRuns);
const listRepositoriesMock = vi.mocked(listRepositories);
const listReviewersMock = vi.mocked(listReviewers);
const listActivityMock = vi.mocked(listActivity);

const CLAIMED: SetupState = {
  claimed: true,
  appCreated: true,
  installed: true,
  appSlug: 'jury-forge-local',
};

const READINESS: InstanceReadiness = {
  claimed: true,
  appInstalled: true,
  reposEnabled: 0,
  reviewersWithKey: 0,
  repoReviewerPairs: 0,
  firstRunAt: null,
  completed: 2,
  total: 5,
  steps: [
    { key: 'claim', label: 'Claim the instance', href: '/setup', done: true },
    { key: 'install-app', label: 'Install the GitHub App', href: '/setup', done: true },
    { key: 'enable-repo', label: 'Enable a repository', href: '/repositories', done: false },
    {
      key: 'add-reviewer',
      label: 'Add a reviewer with a model key',
      href: '/reviewers/new',
      done: false,
    },
    { key: 'first-run', label: 'See the first run', href: '/runs', done: false },
  ],
  nextStep: {
    key: 'enable-repo',
    title: 'Turn on a repository',
    body: 'Pick a repository for the first review.',
    href: '/repositories',
    label: 'Choose a repository',
  },
};

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, '', '/');
  fetchSessionMock.mockResolvedValue({ login: 'prakashsewani', avatarUrl: null });
  fetchSetupStateMock.mockResolvedValue(CLAIMED);
  getReadinessMock.mockResolvedValue(READINESS);
  listRunsMock.mockResolvedValue({ runs: [], nextCursor: null });
  listRepositoriesMock.mockResolvedValue([]);
  listReviewersMock.mockResolvedValue([]);
  listActivityMock.mockResolvedValue({ activity: [], nextCursor: null });
});

describe('client-side routing', () => {
  it('renders the right screen for a direct deep link', async () => {
    window.history.replaceState(null, '', '/reviewers');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Reviewers' })).toBeTruthy();
  });

  it('navigate swaps the screen and loads the session exactly once', async () => {
    render(<App />);
    expect(await screen.findByText('Getting started')).toBeTruthy();

    act(() => {
      navigate('/reviewers');
    });

    expect(await screen.findByRole('heading', { name: 'Reviewers' })).toBeTruthy();
    expect(window.location.pathname).toBe('/reviewers');
    expect(fetchSessionMock).toHaveBeenCalledTimes(1);
    expect(fetchSetupStateMock).toHaveBeenCalledTimes(1);
  });

  it('routes a plain anchor click through the router', async () => {
    render(<App />);
    expect(await screen.findByText('Getting started')).toBeTruthy();

    fireEvent.click(screen.getByRole('link', { name: 'Reviewers' }));

    expect(await screen.findByRole('heading', { name: 'Reviewers' })).toBeTruthy();
    expect(window.location.pathname).toBe('/reviewers');
    expect(fetchSessionMock).toHaveBeenCalledTimes(1);
  });

  it('restores the previous screen on popstate', async () => {
    render(<App />);
    expect(await screen.findByText('Getting started')).toBeTruthy();

    act(() => {
      navigate('/reviewers');
    });
    expect(await screen.findByRole('heading', { name: 'Reviewers' })).toBeTruthy();

    act(() => {
      window.history.replaceState(null, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(await screen.findByText('Getting started')).toBeTruthy();
  });

  it('does not intercept a modified click', async () => {
    render(<App />);
    expect(await screen.findByText('Getting started')).toBeTruthy();

    const pushState = vi.spyOn(window.history, 'pushState');
    fireEvent.click(screen.getByRole('link', { name: 'Reviewers' }), { metaKey: true });
    expect(pushState).not.toHaveBeenCalled();
    pushState.mockRestore();
  });

  it('falls back to the overview for an unknown path', async () => {
    window.history.replaceState(null, '', '/definitely-not-a-route');
    render(<App />);
    expect(await screen.findByText('Getting started')).toBeTruthy();
  });
});
