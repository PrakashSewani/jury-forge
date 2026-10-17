import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportReviewers, listRepositories, listReviewers } from '../src/lib/api';
import ReviewersPage from '../src/pages/ReviewersPage';

vi.mock('../src/lib/api', () => ({
  listReviewers: vi.fn(),
  listRepositories: vi.fn(),
  exportReviewers: vi.fn(),
  importReviewers: vi.fn(),
  updateReviewer: vi.fn(),
  downloadReviewersExport: vi.fn(),
}));

const listReviewersMock = vi.mocked(listReviewers);
const listRepositoriesMock = vi.mocked(listRepositories);
const exportReviewersMock = vi.mocked(exportReviewers);

beforeEach(() => {
  vi.resetAllMocks();
  listReviewersMock.mockResolvedValue([]);
  listRepositoriesMock.mockResolvedValue([]);
});

describe('error taxonomy on a screen', () => {
  it('renders the shared sentence for a known code', async () => {
    const user = userEvent.setup();
    exportReviewersMock.mockRejectedValue(
      Object.assign(new Error('nope'), { code: 'request_failed' }),
    );
    render(<ReviewersPage />);
    await screen.findByText('No reviewers yet');

    await user.click(screen.getByRole('button', { name: 'Export' }));

    expect(
      await screen.findByText('The dashboard API did not respond. Check the Worker and try again.'),
    ).toBeTruthy();
    expect(screen.queryByText('request_failed')).toBeNull();
  });

  it('renders the screen fallback and hides an unknown code', async () => {
    const user = userEvent.setup();
    exportReviewersMock.mockRejectedValue(
      Object.assign(new Error('nope'), { code: 'garbage_code_xyz' }),
    );
    render(<ReviewersPage />);
    await screen.findByText('No reviewers yet');

    await user.click(screen.getByRole('button', { name: 'Export' }));

    expect(await screen.findByText('Could not export the reviewers. Try again.')).toBeTruthy();
    expect(screen.queryByText('garbage_code_xyz')).toBeNull();
  });

  it('renders the fallback for a non-Error throw', async () => {
    const user = userEvent.setup();
    exportReviewersMock.mockRejectedValue('not an error object');
    render(<ReviewersPage />);
    await screen.findByText('No reviewers yet');

    await user.click(screen.getByRole('button', { name: 'Export' }));

    expect(await screen.findByText('Could not export the reviewers. Try again.')).toBeTruthy();
  });
});
