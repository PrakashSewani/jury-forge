import type { Reviewer } from '@jury-forge/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/api')>();
  return {
    ...actual,
    createReviewer: vi.fn(),
    deleteReviewer: vi.fn(),
    getReviewer: vi.fn(),
    listReviewers: vi.fn(),
    updateReviewer: vi.fn(),
  };
});

import { createReviewer, getReviewer, listReviewers, updateReviewer } from '../src/lib/api';
import ReviewerEditorPage from '../src/pages/ReviewerEditorPage';

const createReviewerMock = vi.mocked(createReviewer);
const getReviewerMock = vi.mocked(getReviewer);
const listReviewersMock = vi.mocked(listReviewers);
const updateReviewerMock = vi.mocked(updateReviewer);

function reviewer(overrides: Partial<Reviewer> = {}): Reviewer {
  return {
    id: 'rev-security',
    name: 'Security',
    instructions: 'Hunt for injection.',
    rules: 'Block on leaked secrets.',
    flavor: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5',
    params: {},
    enabled: true,
    hasApiKey: true,
    repositories: [],
    ...overrides,
  };
}

const KEYED = reviewer();
const KEYLESS = reviewer({ id: 'rev-nokey', name: 'No key', hasApiKey: false });

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText('Name'), 'Reused reviewer');
  await user.type(screen.getByLabelText('Model'), 'gpt-5');
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('reusing a stored model key in the reviewer editor', () => {
  it('offers the key of another reviewer beside pasting a new one', async () => {
    const user = userEvent.setup();
    listReviewersMock.mockResolvedValue([KEYED, KEYLESS]);

    render(<ReviewerEditorPage />);

    const reuse = await screen.findByRole('radio', { name: 'Reuse a stored key' });
    expect(screen.getByRole('radio', { name: 'Paste a new key' })).toBeTruthy();

    await user.click(reuse);

    const select = screen.getByLabelText('Reuse the key stored on', { exact: false });
    expect(within(select).getByRole('option', { name: 'Security — gpt-5' })).toBeTruthy();
    // Only reviewers that actually hold a key can be a source.
    expect(within(select).getAllByRole('option')).toHaveLength(1);
    // The value is never rendered: the paste input is gone, not merely disabled.
    expect(screen.queryByLabelText('API key', { exact: false })).toBeNull();
  });

  it('offers no reuse choice when no other reviewer holds a key', async () => {
    listReviewersMock.mockResolvedValue([KEYLESS]);

    render(<ReviewerEditorPage />);

    expect(await screen.findByLabelText('API key', { exact: false })).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'Reuse a stored key' })).toBeNull();
    expect(screen.queryByLabelText('Reuse the key stored on', { exact: false })).toBeNull();
  });

  it('sends the source reviewer id and no key value at all', async () => {
    const user = userEvent.setup();
    listReviewersMock.mockResolvedValue([KEYED]);
    createReviewerMock.mockResolvedValue(KEYED);

    render(<ReviewerEditorPage />);
    await user.click(await screen.findByRole('radio', { name: 'Reuse a stored key' }));
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Create reviewer' }));

    await waitFor(() => expect(createReviewerMock).toHaveBeenCalledTimes(1));
    const input = createReviewerMock.mock.calls[0][0];
    expect(input.apiKeyFromReviewerId).toBe('rev-security');
    expect('apiKey' in input).toBe(false);
  });

  it('keeps the reviewer itself out of its own key sources', async () => {
    const user = userEvent.setup();
    const self = reviewer({ id: 'rev-self', name: 'Self' });
    getReviewerMock.mockResolvedValue(self);
    listReviewersMock.mockResolvedValue([self, KEYED]);

    render(<ReviewerEditorPage id="rev-self" />);
    await screen.findByDisplayValue('Self');
    await user.click(screen.getByRole('radio', { name: 'Reuse a stored key' }));

    const select = screen.getByLabelText('Reuse the key stored on', { exact: false });
    expect(within(select).getByRole('option', { name: 'Security — gpt-5' })).toBeTruthy();
    expect(within(select).queryByRole('option', { name: 'Self' })).toBeNull();
  });

  it('tells two sources with the same name apart in the picker', async () => {
    const user = userEvent.setup();
    listReviewersMock.mockResolvedValue([
      reviewer({ id: '3f7a1c20-1111-4a11-9a11-aaaa11112222', name: 'Security' }),
      reviewer({ id: '9b8c7d60-2222-4b22-9b22-bbbb22223333', name: 'Security' }),
    ]);

    render(<ReviewerEditorPage />);
    await user.click(await screen.findByRole('radio', { name: 'Reuse a stored key' }));

    const select = screen.getByLabelText('Reuse the key stored on', { exact: false });
    const labels = within(select)
      .getAllByRole('option')
      .map((option) => option.textContent);
    // `reviewers.name` is not unique, so a repeated name carries its short id — the operator can
    // tell which stored key they are copying.
    expect(labels).toEqual(['Security — gpt-5 (3f7a1c20)', 'Security — gpt-5 (9b8c7d60)']);
  });

  it('sends the source reviewer id when the edit screen is saved with reuse selected', async () => {
    const user = userEvent.setup();
    const edited = reviewer({ id: 'rev-edit', name: 'Edited' });
    getReviewerMock.mockResolvedValue(edited);
    listReviewersMock.mockResolvedValue([edited, KEYED]);
    updateReviewerMock.mockResolvedValue(edited);

    render(<ReviewerEditorPage id="rev-edit" />);
    await screen.findByDisplayValue('Edited');
    await user.click(await screen.findByRole('radio', { name: 'Reuse a stored key' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateReviewerMock).toHaveBeenCalledTimes(1));
    expect(updateReviewerMock.mock.calls[0][0]).toBe('rev-edit');
    const input = updateReviewerMock.mock.calls[0][1];
    expect(input.apiKeyFromReviewerId).toBe('rev-security');
    expect('apiKey' in input).toBe(false);
  });

  it('goes back to sending a typed key when pasting is chosen again', async () => {
    const user = userEvent.setup();
    listReviewersMock.mockResolvedValue([KEYED]);
    createReviewerMock.mockResolvedValue(KEYED);

    render(<ReviewerEditorPage />);
    await user.click(await screen.findByRole('radio', { name: 'Reuse a stored key' }));
    await user.click(screen.getByRole('radio', { name: 'Paste a new key' }));
    await user.type(await screen.findByLabelText('API key', { exact: false }), 'sk-typed');
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: 'Create reviewer' }));

    await waitFor(() => expect(createReviewerMock).toHaveBeenCalledTimes(1));
    const input = createReviewerMock.mock.calls[0][0];
    expect(input.apiKey).toBe('sk-typed');
    expect('apiKeyFromReviewerId' in input).toBe(false);
  });
});
