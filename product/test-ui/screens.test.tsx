import type {
  ActivityEntry,
  InstanceReadiness,
  Repository,
  Reviewer,
  RunDetail,
  RunSummary,
  SettingsResponse,
} from '@jury-forge/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getReadiness,
  getRepositoryReviewers,
  getReviewer,
  getRun,
  getSettings,
  listActivity,
  listRepositories,
  listReviewers,
  listRuns,
  updateSettings,
} from '../src/lib/api';
import ActivityPage from '../src/pages/ActivityPage';
import HomePage from '../src/pages/HomePage';
import RepositoriesPage from '../src/pages/RepositoriesPage';
import ReviewerEditorPage from '../src/pages/ReviewerEditorPage';
import ReviewersPage from '../src/pages/ReviewersPage';
import RunDetailPage from '../src/pages/RunDetailPage';
import RunsPage from '../src/pages/RunsPage';
import SettingsPage from '../src/pages/SettingsPage';

vi.mock('../src/lib/api', () => ({
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
  getReadiness: vi.fn(),
  listOpenPullRequests: vi.fn(),
  startTryRun: vi.fn(),
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  listActivity: vi.fn(),
  exportReviewers: vi.fn(),
  importReviewers: vi.fn(),
  downloadReviewersExport: vi.fn(),
}));

const listRunsMock = vi.mocked(listRuns);
const listRepositoriesMock = vi.mocked(listRepositories);
const listReviewersMock = vi.mocked(listReviewers);
const getRepositoryReviewersMock = vi.mocked(getRepositoryReviewers);
const getReviewerMock = vi.mocked(getReviewer);
const getRunMock = vi.mocked(getRun);
const getReadinessMock = vi.mocked(getReadiness);
const getSettingsMock = vi.mocked(getSettings);
const updateSettingsMock = vi.mocked(updateSettings);
const listActivityMock = vi.mocked(listActivity);

const pending = () => new Promise<never>(() => {});

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

const READINESS_DONE: InstanceReadiness = {
  ...READINESS,
  reposEnabled: 3,
  reviewersWithKey: 1,
  repoReviewerPairs: 1,
  firstRunAt: 1_700_000_000,
  completed: 5,
  steps: READINESS.steps.map((step) => ({ ...step, done: true })),
  nextStep: {
    key: 'done',
    title: 'Your jury is running',
    body: 'Every enabled repository is reviewed.',
    href: '/runs',
    label: 'View all runs',
  },
};

const COMPLETED_RUN: RunSummary = {
  id: '101:12:sha:delivery',
  repoId: 101,
  prNumber: 12,
  headSha: '9f2c1a7e4b8d0f3a6c5e2b1d4a7f0c3e8b6d9a2f',
  event: 'pull_request',
  status: 'completed',
  mode: 'auto',
  error: null,
  reviewUrl: 'https://github.com/prakashsewani/jury-forge/pull/12#pullrequestreview-1',
  createdAt: 1_700_000_000,
  finishedAt: 1_700_000_100,
};

const RUNNING_RUN: RunSummary = {
  ...COMPLETED_RUN,
  id: '101:11:sha:delivery',
  prNumber: 11,
  status: 'running',
  reviewUrl: null,
  finishedAt: null,
};

const REVIEWER: Reviewer = {
  id: 'rev-security',
  name: 'Security',
  instructions: 'Look for injection.',
  rules: 'Error on exploitable issues.',
  flavor: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-5',
  params: { temperature: 0.2 },
  enabled: true,
  hasApiKey: true,
  repositories: ['prakashsewani/jury-forge'],
};

const REPO: Repository = {
  repoId: 101,
  fullName: 'prakashsewani/jury-forge',
  private: true,
  enabled: true,
};

const SETTINGS: SettingsResponse = {
  settings: {
    inlineCommentsPerReviewer: 10,
    inlineCommentsPerRun: 25,
    contextTotalBytes: 200_000,
    contextFileBytes: 32_000,
    descriptionLimit: 4_096,
    blockingMode: false,
    blockingErrorThreshold: 1,
    repoInstructions: false,
    repoInstructionsMaxBytes: 8_000,
  },
  defaults: {
    inlineCommentsPerReviewer: 10,
    inlineCommentsPerRun: 25,
    contextTotalBytes: 200_000,
    contextFileBytes: 32_000,
    descriptionLimit: 4_096,
    blockingMode: false,
    blockingErrorThreshold: 1,
    repoInstructions: false,
    repoInstructionsMaxBytes: 8_000,
  },
};

const RUN_DETAIL: RunDetail = {
  run: COMPLETED_RUN,
  reviewers: [
    {
      reviewerId: 'rev-security',
      status: 'completed',
      findings: [
        {
          file: 'a.ts',
          line: 10,
          severity: 'error',
          title: 'Leaked secret',
          body: 'Secret leaked.',
        },
        { file: 'b.ts', line: 5, severity: 'warning', title: 'Wrong layer', body: 'Wrong layer.' },
      ],
      summary: 'One blocking issue.',
      usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
      error: null,
    },
  ],
};

const MANUAL_RUN_DETAIL: RunDetail = {
  ...RUN_DETAIL,
  run: { ...COMPLETED_RUN, mode: 'manual', reviewUrl: null },
};

const ACTIVITY_ONE: ActivityEntry = {
  id: 1,
  at: 1_700_000_000,
  actor: 'prakashsewani',
  action: 'sign_in',
  target: 'prakashsewani',
  detail: null,
};

const ACTIVITY_TWO: ActivityEntry = {
  id: 2,
  at: 1_700_000_100,
  actor: 'webhook',
  action: 'repository.enable',
  target: 'prakashsewani/jury-forge',
  detail: 'reviewers: rev-security',
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('HomePage', () => {
  it('shows a loading state while readiness loads', () => {
    getReadinessMock.mockReturnValue(pending());
    listRunsMock.mockReturnValue(pending());
    listRepositoriesMock.mockReturnValue(pending());
    render(<HomePage user={{ login: 'prakashsewani', avatarUrl: null }} />);
    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('leads with the computed readiness and its next step', async () => {
    getReadinessMock.mockResolvedValue(READINESS);
    listRunsMock.mockResolvedValue({ runs: [COMPLETED_RUN], nextCursor: null });
    listRepositoriesMock.mockResolvedValue([REPO]);
    render(<HomePage user={{ login: 'prakashsewani', avatarUrl: null }} />);
    expect(await screen.findByText('2 of 5 done')).toBeTruthy();
    expect(screen.getByText('Turn on a repository')).toBeTruthy();
    expect(screen.getByText('Pick a repository for the first review.')).toBeTruthy();
    const action = screen.getByRole('link', { name: 'Choose a repository' });
    expect(action.getAttribute('href')).toBe('/repositories');
    expect(await screen.findByRole('link', { name: 'prakashsewani/jury-forge' })).toBeTruthy();
    expect(screen.getByText('completed')).toBeTruthy();
  });

  it('renders every step with done and not-done markers from the API', async () => {
    getReadinessMock.mockResolvedValue(READINESS);
    listRunsMock.mockResolvedValue({ runs: [], nextCursor: null });
    listRepositoriesMock.mockResolvedValue([]);
    render(<HomePage user={{ login: 'prakashsewani', avatarUrl: null }} />);
    expect(await screen.findByText('Claim the instance')).toBeTruthy();
    for (const step of READINESS.steps) {
      expect(screen.getByText(step.label)).toBeTruthy();
    }
    expect(screen.getAllByText('Done')).toHaveLength(2);
    expect(screen.getAllByText('To do')).toHaveLength(3);
  });

  it('shows the closing next step when every step is done', async () => {
    getReadinessMock.mockResolvedValue(READINESS_DONE);
    listRunsMock.mockResolvedValue({ runs: [], nextCursor: null });
    listRepositoriesMock.mockResolvedValue([]);
    render(<HomePage user={{ login: 'prakashsewani', avatarUrl: null }} />);
    expect(await screen.findByText('5 of 5 done')).toBeTruthy();
    expect(screen.getByText('Your jury is running')).toBeTruthy();
    expect(screen.getByText('Every enabled repository is reviewed.')).toBeTruthy();
    const action = screen.getByRole('link', { name: 'View all runs' });
    expect(action.getAttribute('href')).toBe('/runs');
    expect(screen.getAllByText('Done')).toHaveLength(5);
  });

  it('shows the page error and refetches when readiness fails', async () => {
    const user = userEvent.setup();
    getReadinessMock.mockRejectedValueOnce(
      Object.assign(new Error('nope'), { code: 'request_failed' }),
    );
    getReadinessMock.mockResolvedValue(READINESS);
    listRunsMock.mockResolvedValue({ runs: [], nextCursor: null });
    listRepositoriesMock.mockResolvedValue([]);
    render(<HomePage user={{ login: 'prakashsewani', avatarUrl: null }} />);
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.getByText(/overview could not be loaded/i)).toBeTruthy();
    expect(screen.queryByText('request_failed')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('2 of 5 done')).toBeTruthy();
    expect(getReadinessMock).toHaveBeenCalledTimes(2);
  });

  it('invites the user to create a reviewer when there are no runs', async () => {
    getReadinessMock.mockResolvedValue(READINESS);
    listRunsMock.mockResolvedValue({ runs: [], nextCursor: null });
    listRepositoriesMock.mockResolvedValue([]);
    render(<HomePage user={{ login: 'prakashsewani', avatarUrl: null }} />);
    expect(await screen.findByText('No runs yet')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Create a reviewer' })).toBeTruthy();
  });
});

describe('ReviewersPage', () => {
  it('shows a loading state', () => {
    listReviewersMock.mockReturnValue(pending());
    listRepositoriesMock.mockReturnValue(pending());
    render(<ReviewersPage />);
    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('explains how to add the first reviewer when the list is empty', async () => {
    listReviewersMock.mockResolvedValue([]);
    listRepositoriesMock.mockResolvedValue([]);
    render(<ReviewersPage />);
    expect(await screen.findByText('No reviewers yet')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'New reviewer' }).length).toBeGreaterThan(0);
  });

  it('lists a reviewer with its model, key, and state', async () => {
    listReviewersMock.mockResolvedValue([REVIEWER]);
    listRepositoriesMock.mockResolvedValue([REPO]);
    render(<ReviewersPage />);
    expect(await screen.findByRole('link', { name: 'Security' })).toBeTruthy();
    expect(screen.getByText('gpt-5')).toBeTruthy();
    expect(screen.getByText('set')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Enabled' })).toBeTruthy();
    expect(getRepositoryReviewersMock).not.toHaveBeenCalled();
  });

  it('renders All N enabled repositories when the reviewer covers every enabled repo', async () => {
    const secondRepo: Repository = { ...REPO, repoId: 102, fullName: 'prakashsewani/site' };
    listReviewersMock.mockResolvedValue([
      { ...REVIEWER, repositories: ['prakashsewani/jury-forge', 'prakashsewani/site'] },
    ]);
    listRepositoriesMock.mockResolvedValue([REPO, secondRepo]);
    render(<ReviewersPage />);
    expect(await screen.findByText('All 2 enabled repositories')).toBeTruthy();
    expect(getRepositoryReviewersMock).not.toHaveBeenCalled();
  });

  it('renders the repository names when the reviewer covers a subset', async () => {
    const secondRepo: Repository = { ...REPO, repoId: 102, fullName: 'prakashsewani/site' };
    listReviewersMock.mockResolvedValue([REVIEWER]);
    listRepositoriesMock.mockResolvedValue([REPO, secondRepo]);
    render(<ReviewersPage />);
    expect(await screen.findByText('prakashsewani/jury-forge')).toBeTruthy();
    expect(screen.queryByText('prakashsewani/site')).toBeNull();
    expect(getRepositoryReviewersMock).not.toHaveBeenCalled();
  });

  it('renders None when the reviewer covers no repositories', async () => {
    listReviewersMock.mockResolvedValue([{ ...REVIEWER, repositories: [] }]);
    listRepositoriesMock.mockResolvedValue([REPO]);
    render(<ReviewersPage />);
    expect(await screen.findByText('None')).toBeTruthy();
    expect(getRepositoryReviewersMock).not.toHaveBeenCalled();
  });
});

describe('ReviewerEditorPage', () => {
  it('renders the sectioned form for a new reviewer', () => {
    render(<ReviewerEditorPage />);
    expect(screen.getByRole('heading', { name: 'New reviewer' })).toBeTruthy();
    expect(screen.getByLabelText('Name')).toBeTruthy();
    expect(screen.getByLabelText('Model')).toBeTruthy();
    expect(screen.getByLabelText('API key', { exact: false })).toBeTruthy();
    expect(screen.getByLabelText('Instructions', { exact: false })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create reviewer' })).toBeTruthy();
  });

  it('shows a loading state while an existing reviewer loads', () => {
    getReviewerMock.mockReturnValue(pending());
    render(<ReviewerEditorPage id="rev-security" />);
    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('shows a human error with a retry when the reviewer cannot be loaded', async () => {
    getReviewerMock.mockRejectedValue(Object.assign(new Error('nope'), { code: 'not_found' }));
    render(<ReviewerEditorPage id="rev-security" />);
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.getByText(/could not be loaded/i)).toBeTruthy();
    expect(screen.queryByText('not_found')).toBeNull();
  });
});

describe('RepositoriesPage', () => {
  it('shows a loading state', () => {
    listRepositoriesMock.mockReturnValue(pending());
    render(<RepositoriesPage />);
    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('explains how to import repositories when there are none', async () => {
    listRepositoriesMock.mockResolvedValue([]);
    render(<RepositoriesPage />);
    expect(await screen.findByText('No repositories yet')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Refresh from GitHub' }).length).toBeGreaterThan(
      0,
    );
  });

  it('expands a row to show the per-repo reviewer toggles', async () => {
    const user = userEvent.setup();
    listRepositoriesMock.mockResolvedValue([REPO]);
    getRepositoryReviewersMock.mockResolvedValue([
      { reviewerId: 'rev-security', name: 'Security', enabled: true },
    ]);
    render(<RepositoriesPage />);
    expect(await screen.findByText('prakashsewani/jury-forge')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Manage reviewers' }));
    expect(await screen.findByRole('switch', { name: 'Security' })).toBeTruthy();
  });
});

describe('RunsPage', () => {
  it('shows a loading state', () => {
    listRunsMock.mockReturnValue(pending());
    listRepositoriesMock.mockReturnValue(pending());
    render(<RunsPage />);
    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('filters the table by status', async () => {
    const user = userEvent.setup();
    listRunsMock.mockResolvedValue({
      runs: [COMPLETED_RUN, RUNNING_RUN],
      nextCursor: null,
    });
    listRepositoriesMock.mockResolvedValue([REPO]);
    render(<RunsPage />);
    expect(await screen.findAllByRole('link', { name: 'prakashsewani/jury-forge' })).toBeTruthy();
    const table = screen.getByRole('table');
    expect(within(table).getByText('completed')).toBeTruthy();
    expect(within(table).getByText('running')).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('Status'), 'running');
    expect(within(table).queryByText('completed')).toBeNull();
    expect(within(table).getByText('running')).toBeTruthy();
  });

  it('invites the user to enable a repository when there are no runs', async () => {
    listRunsMock.mockResolvedValue({ runs: [], nextCursor: null });
    listRepositoriesMock.mockResolvedValue([]);
    render(<RunsPage />);
    expect(await screen.findByText('No runs yet')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Enable a repository' })).toBeTruthy();
  });

  it('marks a manual trial in the run list, where the history is scanned', async () => {
    listRunsMock.mockResolvedValue({
      runs: [{ ...COMPLETED_RUN, mode: 'manual', reviewUrl: null }, RUNNING_RUN],
      nextCursor: null,
    });
    listRepositoriesMock.mockResolvedValue([REPO]);
    render(<RunsPage />);
    const table = await screen.findByRole('table');
    expect(within(table).getByText('manual')).toBeTruthy();
    // Only the manual row is marked; the automatic one keeps its plain status cell.
    expect(within(table).getAllByText('manual')).toHaveLength(1);
  });
});

describe('RunDetailPage', () => {
  it('shows a loading state', () => {
    getRunMock.mockReturnValue(pending());
    listReviewersMock.mockReturnValue(pending());
    render(<RunDetailPage id="run-1" />);
    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('shows a human error with a retry', async () => {
    getRunMock.mockRejectedValue(Object.assign(new Error('nope'), { code: 'not_found' }));
    listReviewersMock.mockResolvedValue([]);
    render(<RunDetailPage id="run-1" />);
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.getByText(/could not be loaded/i)).toBeTruthy();
    expect(screen.queryByText('not_found')).toBeNull();
  });

  it('groups findings by reviewer and filters by severity', async () => {
    const user = userEvent.setup();
    getRunMock.mockResolvedValue(RUN_DETAIL);
    listReviewersMock.mockResolvedValue([REVIEWER]);
    render(<RunDetailPage id="run-1" />);
    expect(await screen.findByRole('heading', { name: 'Security' })).toBeTruthy();
    expect(screen.getByText('Leaked secret')).toBeTruthy();
    expect(screen.getByText('Wrong layer')).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: 'Errors' }));
    expect(screen.getByText('Leaked secret')).toBeTruthy();
    expect(screen.queryByText('Wrong layer')).toBeNull();
  });

  it('says a manual run was not posted to GitHub', async () => {
    getRunMock.mockResolvedValue(MANUAL_RUN_DETAIL);
    listReviewersMock.mockResolvedValue([REVIEWER]);
    render(<RunDetailPage id="run-1" />);
    expect(await screen.findByText(/not posted to GitHub/i)).toBeTruthy();
  });

  it('does not add the manual notice to an automatic run', async () => {
    getRunMock.mockResolvedValue(RUN_DETAIL);
    listReviewersMock.mockResolvedValue([REVIEWER]);
    render(<RunDetailPage id="run-1" />);
    expect(await screen.findByRole('heading', { name: 'Security' })).toBeTruthy();
    expect(screen.queryByText(/not posted to GitHub/i)).toBeNull();
  });
});

describe('SettingsPage', () => {
  it('shows a loading state', () => {
    getSettingsMock.mockReturnValue(pending());
    render(<SettingsPage />);
    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('shows a human error with a retry', async () => {
    getSettingsMock.mockRejectedValue(Object.assign(new Error('nope'), { code: 'internal_error' }));
    render(<SettingsPage />);
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.getByText(/settings could not be loaded/i)).toBeTruthy();
    expect(screen.queryByText('internal_error')).toBeNull();
  });

  it('groups the numbers with their defaults and stages a change', async () => {
    const user = userEvent.setup();
    getSettingsMock.mockResolvedValue(SETTINGS);
    updateSettingsMock.mockResolvedValue(SETTINGS);
    render(<SettingsPage />);
    const input = await screen.findByLabelText('Inline comments per reviewer', { exact: false });
    expect((input as HTMLInputElement).value).toBe('10');
    const save = screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    await user.clear(input);
    await user.type(input, '12');
    expect(save.disabled).toBe(false);
  });
});

describe('ActivityPage', () => {
  it('shows a loading state', () => {
    listActivityMock.mockReturnValue(pending());
    render(<ActivityPage />);
    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('explains when there is no activity yet', async () => {
    listActivityMock.mockResolvedValue({ activity: [], nextCursor: null });
    render(<ActivityPage />);
    expect(await screen.findByText('No activity yet')).toBeTruthy();
  });

  it('filters the trail by actor without changing the table', async () => {
    const user = userEvent.setup();
    listActivityMock.mockResolvedValue({
      activity: [ACTIVITY_ONE, ACTIVITY_TWO],
      nextCursor: null,
    });
    render(<ActivityPage />);
    const table = await screen.findByRole('table');
    expect(await within(table).findByText('sign_in')).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('Actor'), 'webhook');
    expect(within(table).queryByText('sign_in')).toBeNull();
    expect(within(table).getByText('repository.enable')).toBeTruthy();
  });
});
