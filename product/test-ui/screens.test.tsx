import type {
  ActivityEntry,
  InstanceReadiness,
  Repository,
  Reviewer,
  RunDetail,
  RunSummary,
  SettingsResponse,
} from '@jury-forge/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
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
  previewScope,
  saveRepositoryReviewers,
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
  previewScope: vi.fn(),
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
const saveRepositoryReviewersMock = vi.mocked(saveRepositoryReviewers);
const previewScopeMock = vi.mocked(previewScope);
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

const SITE: Repository = { ...REPO, repoId: 102, fullName: 'prakashsewani/site' };

/** The worker's rule, mirrored: `full_name` contains the term, case-insensitively. */
function matching(query: string, repositories: Repository[] = [REPO, SITE]): Repository[] {
  return repositories.filter((repository) =>
    repository.fullName.toLowerCase().includes(query.toLowerCase()),
  );
}

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
    referenceContextFiles: 50,
    referenceContextFileBytes: 32_000,
    referenceContextTotalBytes: 100_000,
    knowledgePackTotalBytes: 64_000,
    knowledgePackFileBytes: 32_000,
    knowledgePackFiles: 50,
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
    referenceContextFiles: 50,
    referenceContextFileBytes: 32_000,
    referenceContextTotalBytes: 100_000,
    knowledgePackTotalBytes: 64_000,
    knowledgePackFileBytes: 32_000,
    knowledgePackFiles: 50,
  },
};

const RUN_DETAIL: RunDetail = {
  knowledge: { packs: [], totalBytes: 0 },
  run: COMPLETED_RUN,
  skippedReviewers: [
    {
      reviewerId: 'rev-docs',
      name: 'Documentation',
      pathsInclude: ['docs/**'],
      pathsExclude: [],
    },
  ],
  changedFiles: 4,
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
      scope: {
        pathsInclude: ['src/**'],
        pathsExclude: [],
        contextPaths: [],
        visibleFiles: 2,
        referenceFiles: [],
      },
      knowledge: null,
      error: null,
    },
  ],
};

const MANUAL_RUN_DETAIL: RunDetail = {
  ...RUN_DETAIL,
  run: { ...COMPLETED_RUN, mode: 'manual', reviewUrl: null },
};

const REVIEWER_KNOWLEDGE = {
  applied: [
    {
      slug: 'docs-style',
      hash: 'a'.repeat(64),
      name: 'Docs style',
      scope: 'global' as const,
      precedence: 100,
      bytes: 1_234,
      manifestBytes: 200,
      docBytes: 1_034,
      includedFiles: ['docs/a.md'],
      droppedFiles: [{ path: 'docs/budget.md', reason: 'budget' as const }],
      withheldFiles: ['docs/internal/secret.md'],
    },
  ],
  notApplied: [],
  totalBytes: 1_234,
  budgetBytes: 64_000,
  overBudget: false,
};

const RUN_DETAIL_WITH_KNOWLEDGE: RunDetail = {
  ...RUN_DETAIL,
  knowledge: {
    packs: [{ slug: 'docs-style', hash: 'a'.repeat(64), bytes: 1_234, reviewers: 1 }],
    totalBytes: 1_234,
  },
  reviewers: RUN_DETAIL.reviewers.map((outcome) => ({
    ...outcome,
    knowledge: REVIEWER_KNOWLEDGE,
  })),
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
  // A query left by one test (the repository search, the run filters) must not narrow the next.
  window.history.replaceState(null, '', '/');
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
    expect(screen.getByText('Knowledge packs')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Knowledge' }).getAttribute('href')).toBe('/packs');
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
  // The term lives in the URL, so every case starts from a clean one.
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

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
      {
        reviewerId: 'rev-security',
        name: 'Security',
        enabled: true,
        pathsInclude: [],
        pathsExclude: [],
        contextPaths: [],
      },
    ]);
    render(<RepositoriesPage />);
    expect(await screen.findByText('prakashsewani/jury-forge')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Manage reviewers' }));
    expect(await screen.findByRole('switch', { name: 'Security' })).toBeTruthy();
    expect(screen.getByPlaceholderText('docs/**, *.md')).toBeTruthy();
    expect(screen.getByPlaceholderText('docs/legacy/**')).toBeTruthy();
    expect(screen.getByPlaceholderText('docs/')).toBeTruthy();
  });

  it('previews a reviewer scope against the newest run', async () => {
    const user = userEvent.setup();
    listRepositoriesMock.mockResolvedValue([REPO]);
    const reviewer = {
      reviewerId: 'rev-docs',
      name: 'Documentation',
      enabled: true,
      pathsInclude: [],
      pathsExclude: [],
      contextPaths: [],
    };
    getRepositoryReviewersMock.mockResolvedValue([reviewer]);
    previewScopeMock.mockResolvedValue({
      runId: '101:1:x:delivery',
      headSha: 'x',
      total: 4,
      matched: ['docs/a.md'],
    });
    render(<RepositoriesPage />);
    await screen.findByText('prakashsewani/jury-forge');
    await user.click(screen.getByRole('button', { name: 'Manage reviewers' }));
    await screen.findByRole('switch', { name: 'Documentation' });

    await user.type(screen.getByPlaceholderText('docs/**, *.md'), 'docs/**');
    await user.click(screen.getByRole('button', { name: 'Preview scope' }));

    expect(await screen.findByText(/Matches 1 of 4 changed file/)).toBeTruthy();
    expect(previewScopeMock).toHaveBeenCalledWith(101, {
      pathsInclude: ['docs/**'],
      pathsExclude: [],
    });
  });

  it('saves a reviewer path scope as comma-separated lists', async () => {
    const user = userEvent.setup();
    listRepositoriesMock.mockResolvedValue([REPO]);
    const reviewer = {
      reviewerId: 'rev-docs',
      name: 'Documentation',
      enabled: true,
      pathsInclude: [],
      pathsExclude: [],
      contextPaths: [],
    };
    getRepositoryReviewersMock.mockResolvedValue([reviewer]);
    saveRepositoryReviewersMock.mockResolvedValue([reviewer]);
    render(<RepositoriesPage />);
    await screen.findByText('prakashsewani/jury-forge');
    await user.click(screen.getByRole('button', { name: 'Manage reviewers' }));
    await screen.findByRole('switch', { name: 'Documentation' });

    await user.type(screen.getByPlaceholderText('docs/**, *.md'), 'docs/**, *.md');
    await user.type(screen.getByPlaceholderText('docs/legacy/**'), 'docs/legacy/**');
    await user.type(screen.getByPlaceholderText('docs/'), 'docs/');
    await user.click(screen.getByRole('button', { name: 'Save reviewers' }));

    await waitFor(() =>
      expect(saveRepositoryReviewersMock).toHaveBeenCalledWith(101, [
        {
          reviewerId: 'rev-docs',
          enabled: true,
          pathsInclude: ['docs/**', '*.md'],
          pathsExclude: ['docs/legacy/**'],
          contextPaths: ['docs/'],
        },
      ]),
    );
  });

  it('gives the search field an accessible name', async () => {
    listRepositoriesMock.mockResolvedValue([REPO]);
    render(<RepositoriesPage />);
    const field = await screen.findByRole('searchbox', { name: 'Search repositories' });
    expect(field.tagName).toBe('INPUT');
    expect((field as HTMLInputElement).type).toBe('search');
  });

  it('filters the table as the term is typed, and clearing restores every row', async () => {
    const user = userEvent.setup();
    listRepositoriesMock.mockImplementation(async (_refresh, _signal, q = '') => matching(q));
    render(<RepositoriesPage />);
    expect(await screen.findByText('prakashsewani/jury-forge')).toBeTruthy();
    expect(screen.getByText('prakashsewani/site')).toBeTruthy();

    const field = screen.getByLabelText('Search repositories');
    await user.type(field, 'site');
    // The filter is the server's: the term leaves the dashboard as the query, not as a client filter.
    await waitFor(() =>
      expect(listRepositoriesMock).toHaveBeenLastCalledWith(false, expect.anything(), 'site'),
    );
    await waitFor(() => expect(screen.queryByText('prakashsewani/jury-forge')).toBeNull());
    expect(screen.getByText('prakashsewani/site')).toBeTruthy();

    await user.clear(field);
    await waitFor(() => expect(screen.getByText('prakashsewani/jury-forge')).toBeTruthy());
    expect(listRepositoriesMock).toHaveBeenLastCalledWith(false, expect.anything(), '');
    expect(screen.getByText('prakashsewani/site')).toBeTruthy();
  });

  it('asks once per typing pause, not once per keystroke', async () => {
    const user = userEvent.setup();
    listRepositoriesMock.mockResolvedValue([REPO]);
    render(<RepositoriesPage />);
    await screen.findByText('prakashsewani/jury-forge');
    expect(listRepositoriesMock).toHaveBeenCalledTimes(1);

    await user.type(screen.getByLabelText('Search repositories'), 'jury');
    await waitFor(() =>
      expect(listRepositoriesMock).toHaveBeenLastCalledWith(false, expect.anything(), 'jury'),
    );
    expect(listRepositoriesMock).toHaveBeenCalledTimes(2);
  });

  it('opens on the term the URL carries, and writes a typed one back in place', async () => {
    window.history.replaceState(null, '', '/repositories?q=site');
    const user = userEvent.setup();
    listRepositoriesMock.mockImplementation(async (_refresh, _signal, q = '') => matching(q));
    render(<RepositoriesPage />);

    const field = (await screen.findByLabelText('Search repositories')) as HTMLInputElement;
    expect(field.value).toBe('site');
    // The URL's term is the first request's: the page does not wait for a keystroke to filter.
    expect(listRepositoriesMock).toHaveBeenCalledWith(false, expect.anything(), 'site');
    expect(screen.queryByText('prakashsewani/jury-forge')).toBeNull();

    const entries = window.history.length;
    await user.type(field, 'x');
    await waitFor(() => expect(window.location.search).toBe('?q=sitex'));
    // Rewritten in place: typing never adds a history entry to walk back through.
    expect(window.history.length).toBe(entries);
  });

  it('shows the empty state for a term that matches nothing, with a way back', async () => {
    const user = userEvent.setup();
    listRepositoriesMock.mockImplementation(async (_refresh, _signal, q = '') => matching(q));
    render(<RepositoriesPage />);
    await screen.findByText('prakashsewani/jury-forge');

    await user.type(screen.getByLabelText('Search repositories'), 'nope');
    expect(await screen.findByText('No matching repositories')).toBeTruthy();
    expect(screen.getByText(/Nothing matches “nope”/)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(await screen.findByText('prakashsewani/jury-forge')).toBeTruthy();
    expect((screen.getByLabelText('Search repositories') as HTMLInputElement).value).toBe('');
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('keeps the rows and the field in place while the next query is in flight', async () => {
    const user = userEvent.setup();
    listRepositoriesMock.mockResolvedValueOnce([REPO]).mockReturnValueOnce(pending());
    render(<RepositoriesPage />);
    const field = (await screen.findByLabelText('Search repositories')) as HTMLInputElement;
    expect(screen.getByText('prakashsewani/jury-forge')).toBeTruthy();

    await user.type(field, 'jury');
    await waitFor(() =>
      expect(listRepositoriesMock).toHaveBeenLastCalledWith(false, expect.anything(), 'jury'),
    );
    // Nothing blanked out and nothing remounted under the field: the previous rows are still the
    // table's, and the input kept both its focus and what was typed into it.
    expect(screen.getByText('prakashsewani/jury-forge')).toBeTruthy();
    expect(screen.queryByText('Loading…')).toBeNull();
    expect(document.activeElement).toBe(field);
    expect(field.value).toBe('jury');
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

  it('shows the scope record and the reviewers its filters dropped', async () => {
    getRunMock.mockResolvedValue(RUN_DETAIL);
    listReviewersMock.mockResolvedValue([REVIEWER]);
    render(<RunDetailPage id="run-1" />);
    expect(await screen.findByText(/2 changed file\(s\) in scope/)).toBeTruthy();
    expect(screen.getByText(/include src\/\*\*/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Not run' })).toBeTruthy();
    expect(screen.getByText(/no changed file matched include docs\/\*\*\./)).toBeTruthy();
    expect(screen.getByText(/4 changed file\(s\)/)).toBeTruthy();
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

  it('shows the knowledge record with its dropped and withheld files', async () => {
    const user = userEvent.setup();
    getRunMock.mockResolvedValue(RUN_DETAIL_WITH_KNOWLEDGE);
    listReviewersMock.mockResolvedValue([REVIEWER]);
    render(<RunDetailPage id="run-1" />);
    expect(await screen.findByRole('heading', { name: 'Knowledge' })).toBeTruthy();
    expect(screen.getByText(/docs-style@aaaaaaa/)).toBeTruthy();
    expect(screen.getByText(/1 pack\(s\) applied/)).toBeTruthy();
    await user.click(screen.getByText(/1 included · 1 dropped · 1 withheld/));
    expect(screen.getByText(/Dropped: docs\/budget\.md \(budget\)/)).toBeTruthy();
    expect(screen.getByText(/Withheld by never_quote: docs\/internal\/secret\.md/)).toBeTruthy();
  });

  it('does not show the knowledge card for a run with no packs', async () => {
    getRunMock.mockResolvedValue(RUN_DETAIL);
    listReviewersMock.mockResolvedValue([REVIEWER]);
    render(<RunDetailPage id="run-1" />);
    await screen.findByRole('heading', { name: 'Security' });
    expect(screen.queryByRole('heading', { name: 'Knowledge' })).toBeNull();
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

  it('shows the knowledge pack budget fields', async () => {
    getSettingsMock.mockResolvedValue(SETTINGS);
    render(<SettingsPage />);
    expect(await screen.findByText('Knowledge packs')).toBeTruthy();
    expect(screen.getByLabelText('Pack text per reviewer', { exact: false })).toBeTruthy();
    expect(screen.getByLabelText('Pack file bytes', { exact: false })).toBeTruthy();
    expect(screen.getByLabelText('Pack files per reviewer', { exact: false })).toBeTruthy();
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

  it('shows each action as a human label with its code kept for reference', async () => {
    listActivityMock.mockResolvedValue({
      activity: [ACTIVITY_ONE, ACTIVITY_TWO],
      nextCursor: null,
    });
    render(<ActivityPage />);
    const list = await screen.findByRole('list');
    expect(within(list).getByText('Signed in')).toBeTruthy();
    expect(within(list).getByText('Enabled repository')).toBeTruthy();
  });

  it('filters the trail by actor and keeps the rest', async () => {
    const user = userEvent.setup();
    listActivityMock.mockResolvedValue({
      activity: [ACTIVITY_ONE, ACTIVITY_TWO],
      nextCursor: null,
    });
    render(<ActivityPage />);
    const list = await screen.findByRole('list');
    expect(await within(list).findByText('Signed in')).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('Actor'), 'webhook');
    expect(within(list).queryByText('Signed in')).toBeNull();
    expect(within(list).getByText('Enabled repository')).toBeTruthy();
  });

  it('searches across actor, action label, target and detail', async () => {
    const user = userEvent.setup();
    listActivityMock.mockResolvedValue({
      activity: [ACTIVITY_ONE, ACTIVITY_TWO],
      nextCursor: null,
    });
    render(<ActivityPage />);
    const list = await screen.findByRole('list');
    await user.type(screen.getByRole('searchbox'), 'enabled');
    expect(within(list).queryByText('Signed in')).toBeNull();
    expect(within(list).getByText('Enabled repository')).toBeTruthy();
  });

  it('offers a way back when the filters match nothing', async () => {
    const user = userEvent.setup();
    listActivityMock.mockResolvedValue({
      activity: [ACTIVITY_ONE, ACTIVITY_TWO],
      nextCursor: null,
    });
    render(<ActivityPage />);
    await screen.findByRole('list');
    await user.type(screen.getByRole('searchbox'), 'zzz-no-match');
    expect(await screen.findByText('No matching activity')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('list')).toBeTruthy();
  });
});
