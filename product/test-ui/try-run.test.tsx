import type { Repository, RepositoryPullRequest, Reviewer } from '@jury-forge/shared';
import { REVIEWER_TEMPLATES } from '@jury-forge/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getReviewer,
  listOpenPullRequests,
  listRepositories,
  listReviewers,
  listRuns,
  startTryRun,
} from '../src/lib/api';
import ReviewerEditorPage from '../src/pages/ReviewerEditorPage';
import RunsPage from '../src/pages/RunsPage';

vi.mock('../src/lib/api', () => ({
  listRuns: vi.fn(),
  listRepositories: vi.fn(),
  listReviewers: vi.fn(),
  getReviewer: vi.fn(),
  createReviewer: vi.fn(),
  updateReviewer: vi.fn(),
  deleteReviewer: vi.fn(),
  listOpenPullRequests: vi.fn(),
  startTryRun: vi.fn(),
}));

const listRunsMock = vi.mocked(listRuns);
const listRepositoriesMock = vi.mocked(listRepositories);
const listReviewersMock = vi.mocked(listReviewers);
const getReviewerMock = vi.mocked(getReviewer);
const listOpenPullRequestsMock = vi.mocked(listOpenPullRequests);
const startTryRunMock = vi.mocked(startTryRun);

const REPO: Repository = {
  repoId: 101,
  fullName: 'prakashsewani/jury-forge',
  private: true,
  enabled: true,
};

const READY_REVIEWER: Reviewer = {
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

const NO_KEY_REVIEWER: Reviewer = {
  ...READY_REVIEWER,
  id: 'rev-nokey',
  name: 'No key',
  hasApiKey: false,
};

const PULL_REQUESTS: RepositoryPullRequest[] = [
  {
    number: 12,
    title: 'Fix the widget',
    headSha: '9f2c1a7e4b8d0f3a6c5e2b1d4a7f0c3e8b6d9a2f',
    authorLogin: 'prakashsewani',
    draft: false,
  },
];

beforeEach(() => {
  vi.resetAllMocks();
});

describe('new reviewer starter choice', () => {
  it('offers a blank reviewer or a template as two explicit choices, with blank as the default', async () => {
    const user = userEvent.setup();
    render(<ReviewerEditorPage />);

    expect(screen.getByRole('heading', { name: 'Start from' })).toBeTruthy();
    const blank = screen.getByRole('radio', { name: 'Blank reviewer' }) as HTMLInputElement;
    const fromTemplate = screen.getByRole('radio', {
      name: 'Start from a template',
    }) as HTMLInputElement;
    expect(blank.checked).toBe(true);
    expect(fromTemplate.checked).toBe(false);
    // No template is chosen and none is applied until the operator picks one.
    expect(screen.queryByLabelText('Template', { exact: false, selector: 'select' })).toBeNull();
    expect(screen.queryByText(/Applied the .* template/)).toBeNull();

    await user.click(fromTemplate);

    const select = screen.getByLabelText('Template', { exact: false, selector: 'select' });
    expect(within(select).getByRole('option', { name: 'Choose a template…' })).toBeTruthy();
    for (const starter of REVIEWER_TEMPLATES) {
      expect(within(select).getByRole('option', { name: starter.name })).toBeTruthy();
    }
    expect(within(select).getAllByRole('option')).toHaveLength(REVIEWER_TEMPLATES.length + 1);
  });

  it('fills name, instructions and rules from the template and leaves the model and base URL alone', async () => {
    const user = userEvent.setup();
    render(<ReviewerEditorPage />);
    const template = REVIEWER_TEMPLATES[0];

    await user.click(screen.getByRole('radio', { name: 'Start from a template' }));
    await user.selectOptions(
      screen.getByLabelText('Template', { exact: false, selector: 'select' }),
      template.key,
    );

    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe(template.name);
    expect(
      (screen.getByLabelText('Instructions', { exact: false }) as HTMLTextAreaElement).value,
    ).toBe(template.instructions);
    expect((screen.getByLabelText('Rules', { exact: false }) as HTMLTextAreaElement).value).toBe(
      template.rules,
    );
    expect((screen.getByLabelText('Model') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Base URL', { exact: false }) as HTMLInputElement).value).toBe(
      'https://api.openai.com/v1',
    );
    expect(screen.getByText(/Applied the Security template/)).toBeTruthy();
  });

  it('keeps a name typed after choosing a template instead of re-applying it', async () => {
    const user = userEvent.setup();
    render(<ReviewerEditorPage />);
    const template = REVIEWER_TEMPLATES[0];
    await user.click(screen.getByRole('radio', { name: 'Start from a template' }));
    await user.selectOptions(
      screen.getByLabelText('Template', { exact: false, selector: 'select' }),
      template.key,
    );

    const name = screen.getByLabelText('Name') as HTMLInputElement;
    await user.clear(name);
    await user.type(name, 'Custom reviewer');

    expect(name.value).toBe('Custom reviewer');
    expect(
      (screen.getByLabelText('Instructions', { exact: false }) as HTMLTextAreaElement).value,
    ).toBe(template.instructions);
  });

  it('leaves every prefilled field editable, so a template is never a lock-in', async () => {
    const user = userEvent.setup();
    render(<ReviewerEditorPage />);
    await user.click(screen.getByRole('radio', { name: 'Start from a template' }));
    await user.selectOptions(
      screen.getByLabelText('Template', { exact: false, selector: 'select' }),
      REVIEWER_TEMPLATES[0].key,
    );

    const rules = screen.getByLabelText('Rules', { exact: false }) as HTMLTextAreaElement;
    await user.clear(rules);
    await user.type(rules, 'Only my rule.');

    expect(rules.value).toBe('Only my rule.');
    expect(screen.getByRole('button', { name: 'Create reviewer' })).toBeTruthy();
  });

  it('does not render the starter choice on the edit screen', async () => {
    getReviewerMock.mockResolvedValue(READY_REVIEWER);
    render(<ReviewerEditorPage id="rev-security" />);

    expect(await screen.findByDisplayValue('Security')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Start from' })).toBeNull();
    expect(screen.queryByLabelText('Template', { exact: false, selector: 'select' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Blank reviewer' })).toBeNull();
  });
});

async function openTryDialog(reviewers: Reviewer[] = [READY_REVIEWER]) {
  listRunsMock.mockResolvedValue({ runs: [], nextCursor: null });
  listRepositoriesMock.mockResolvedValue([REPO]);
  listReviewersMock.mockResolvedValue(reviewers);

  const user = userEvent.setup();
  render(<RunsPage />);
  await screen.findByText('No runs yet');
  await user.click(screen.getByRole('button', { name: 'Try a reviewer' }));
  const dialog = await screen.findByRole('dialog', { name: 'Try a reviewer' });
  return { user, dialog };
}

describe('Try a reviewer dialog', () => {
  it('opens from the header and says a trial posts nothing to GitHub', async () => {
    const { dialog } = await openTryDialog();
    expect(within(dialog).getByText(/posts nothing to GitHub/i)).toBeTruthy();
    expect(within(dialog).getByText(/Jury Forge only/i)).toBeTruthy();
  });

  it('loads the chosen repository open pull requests and labels them', async () => {
    listOpenPullRequestsMock.mockResolvedValue(PULL_REQUESTS);
    const { user, dialog } = await openTryDialog();

    await user.selectOptions(within(dialog).getByLabelText('Repository'), '101');

    await waitFor(() => expect(listOpenPullRequestsMock).toHaveBeenCalledWith(101));
    const pullRequests = within(dialog).getByLabelText('Pull request', { exact: false });
    expect(within(pullRequests).getByRole('option', { name: '#12 — Fix the widget' })).toBeTruthy();
  });

  it('says when the repository has no open pull requests', async () => {
    listOpenPullRequestsMock.mockResolvedValue([]);
    const { user, dialog } = await openTryDialog();

    await user.selectOptions(within(dialog).getByLabelText('Repository'), '101');

    expect(
      await within(dialog).findByText('This repository has no open pull requests.'),
    ).toBeTruthy();
  });

  it('shows a human sentence and a retry when the pull request list fails', async () => {
    listOpenPullRequestsMock
      .mockRejectedValueOnce(new Error('request_failed'))
      .mockResolvedValueOnce(PULL_REQUESTS);
    const { user, dialog } = await openTryDialog();

    await user.selectOptions(within(dialog).getByLabelText('Repository'), '101');

    expect(
      await within(dialog).findByText(
        'The open pull requests could not be loaded. Check the Worker and try again.',
      ),
    ).toBeTruthy();
    expect(within(dialog).queryByText('request_failed')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Try again' }));
    expect(
      await within(dialog).findByRole('option', { name: '#12 — Fix the widget' }),
    ).toBeTruthy();
    expect(listOpenPullRequestsMock).toHaveBeenCalledTimes(2);
  });

  it('renders a reviewer without a key as a disabled option that cannot be chosen', async () => {
    const { user, dialog } = await openTryDialog([READY_REVIEWER, NO_KEY_REVIEWER]);
    const reviewer = within(dialog).getByLabelText('Reviewer') as HTMLSelectElement;

    await waitFor(() => expect(reviewer.value).toBe('rev-security'));
    const option = within(reviewer).getByRole('option', {
      name: 'No key — needs a model key',
    }) as HTMLOptionElement;
    expect(option.disabled).toBe(true);

    await user.selectOptions(reviewer, 'rev-nokey');
    expect(reviewer.value).toBe('rev-security');
  });

  it('submits exactly one repository, pull request and reviewer', async () => {
    listOpenPullRequestsMock.mockResolvedValue(PULL_REQUESTS);
    startTryRunMock.mockResolvedValue({ runId: 'run-1' });
    const { user, dialog } = await openTryDialog();

    await user.selectOptions(within(dialog).getByLabelText('Repository'), '101');
    await screen.findByRole('option', { name: '#12 — Fix the widget' });
    await user.selectOptions(within(dialog).getByLabelText('Pull request', { exact: false }), '12');
    await user.click(within(dialog).getByRole('button', { name: 'Run trial' }));

    await waitFor(() =>
      expect(startTryRunMock).toHaveBeenCalledWith({
        repoId: 101,
        prNumber: 12,
        reviewerIds: ['rev-security'],
      }),
    );
  });

  it('shows a human sentence instead of the raw code when the trial fails', async () => {
    listOpenPullRequestsMock.mockResolvedValue(PULL_REQUESTS);
    startTryRunMock.mockRejectedValue(
      Object.assign(new Error('request_failed'), { code: 'request_failed' }),
    );
    const { user, dialog } = await openTryDialog();

    await user.selectOptions(within(dialog).getByLabelText('Repository'), '101');
    await screen.findByRole('option', { name: '#12 — Fix the widget' });
    await user.selectOptions(within(dialog).getByLabelText('Pull request', { exact: false }), '12');
    await user.click(within(dialog).getByRole('button', { name: 'Run trial' }));

    expect(
      await within(dialog).findByText(
        'The dashboard API did not respond. Check the Worker and try again.',
      ),
    ).toBeTruthy();
    expect(within(dialog).queryByText('request_failed')).toBeNull();
  });
});
