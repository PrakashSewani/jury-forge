import type { InstanceReadiness, Reviewer, SetupState } from '@jury-forge/shared';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import {
  fetchSession,
  fetchSetupState,
  getReadiness,
  getReviewer,
  listActivity,
  listRepositories,
  listReviewers,
  listRuns,
} from '../src/lib/api';
import { navigate, registerNavigationBlocker } from '../src/lib/router';
import { memoryStorage } from './memory-storage';

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
const getReviewerMock = vi.mocked(getReviewer);
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

// Never the ambient `window.localStorage`: Node ≥26 defines that accessor as disabled and vitest's
// happy-dom environment then declines to install its own Storage, which killed all six tests in this
// file (`Cannot read properties of undefined (reading 'getItem')` in `readStoredTheme`). Every UI
// test that renders the shell takes this stub — see `test-ui/memory-storage.ts`.
let store: Storage;

beforeEach(() => {
  vi.resetAllMocks();
  store = memoryStorage();
  vi.stubGlobal('localStorage', store);
  window.history.replaceState(null, '', '/');
  fetchSessionMock.mockResolvedValue({ login: 'prakashsewani', avatarUrl: null });
  fetchSetupStateMock.mockResolvedValue(CLAIMED);
  getReadinessMock.mockResolvedValue(READINESS);
  listRunsMock.mockResolvedValue({ runs: [], nextCursor: null });
  listRepositoriesMock.mockResolvedValue([]);
  listReviewersMock.mockResolvedValue([]);
  listActivityMock.mockResolvedValue({ activity: [], nextCursor: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
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

describe('the navigation guard', () => {
  it('refuses a route change while a registered blocker vetoes it', async () => {
    render(<App />);
    expect(await screen.findByText('Getting started')).toBeTruthy();

    const unregister = registerNavigationBlocker(() => false);
    try {
      act(() => {
        expect(navigate('/reviewers')).toBe(false);
      });
      expect(window.location.pathname).toBe('/');
      expect(screen.getByText('Getting started')).toBeTruthy();
    } finally {
      unregister();
    }
  });

  it('puts the URL back when the back button is vetoed', async () => {
    render(<App />);
    expect(await screen.findByText('Getting started')).toBeTruthy();

    act(() => {
      navigate('/reviewers');
    });
    expect(await screen.findByRole('heading', { name: 'Reviewers' })).toBeTruthy();

    const unregister = registerNavigationBlocker(() => false);
    try {
      act(() => {
        window.history.replaceState(null, '', '/');
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      expect(window.location.pathname).toBe('/reviewers');
      expect(screen.getByRole('heading', { name: 'Reviewers' })).toBeTruthy();
    } finally {
      unregister();
    }
  });

  it('asks before an in-app click discards unsaved edits', async () => {
    window.history.replaceState(null, '', '/reviewers/rev-security');
    getReviewerMock.mockResolvedValue(REVIEWER);
    // happy-dom has no `confirm`, so the stub is the dialog: declined first, accepted second.
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    try {
      render(<App />);
      const name = (await screen.findByLabelText('Name')) as HTMLInputElement;

      act(() => {
        fireEvent.change(name, { target: { value: 'Renamed' } });
      });
      fireEvent.click(screen.getByRole('link', { name: /all reviewers/i }));

      // Declined: the editor is still mounted, still on its own path, with the edit in the field.
      expect(window.location.pathname).toBe('/reviewers/rev-security');
      expect(name.value).toBe('Renamed');

      confirm.mockReturnValue(true);
      fireEvent.click(screen.getByRole('link', { name: /all reviewers/i }));

      expect(window.location.pathname).toBe('/reviewers');
      expect(await screen.findByRole('heading', { name: 'Reviewers' })).toBeTruthy();
    } finally {
      confirm.mockRestore();
    }
  });
});
