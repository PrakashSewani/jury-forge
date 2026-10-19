import type { RunDetail, SetupState } from '@jury-forge/shared';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/api')>();
  return {
    ...actual,
    fetchSetupState: vi.fn(),
    getRun: vi.fn(),
    listReviewers: vi.fn(),
  };
});

import { fetchSetupState, getRun, listReviewers } from '../src/lib/api';
import RunDetailPage from '../src/pages/RunDetailPage';
import SetupPage from '../src/pages/SetupPage';
import { ExternalLink } from '../src/ui';

const fetchSetupStateMock = vi.mocked(fetchSetupState);
const getRunMock = vi.mocked(getRun);
const listReviewersMock = vi.mocked(listReviewers);

function setupState(overrides: Partial<SetupState> = {}): SetupState {
  return { claimed: false, appCreated: false, installed: false, appSlug: null, ...overrides };
}

const RUN_DETAIL: RunDetail = {
  run: {
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
  },
  reviewers: [],
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('ExternalLink', () => {
  it('opens beside the app with the opener and the referrer cut off', () => {
    render(
      <ExternalLink href="https://github.com/apps/jury-forge-test">Install on GitHub</ExternalLink>,
    );
    const link = screen.getByRole('link', { name: /Install on GitHub/ });
    expect(link.getAttribute('href')).toBe('https://github.com/apps/jury-forge-test');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });
});

describe('setup wizard links', () => {
  it('opens the GitHub install page in a new tab', async () => {
    fetchSetupStateMock.mockResolvedValue(
      setupState({ appCreated: true, appSlug: 'jury-forge-test' }),
    );

    render(<SetupPage />);

    const link = await screen.findByRole('link', { name: /Install jury-forge-test on GitHub/ });
    expect(link.getAttribute('href')).toBe(
      'https://github.com/apps/jury-forge-test/installations/new',
    );
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('keeps the GitHub sign-in anchor in the same tab, because GitHub redirects back into it', async () => {
    fetchSetupStateMock.mockResolvedValue(
      setupState({ appCreated: true, installed: true, appSlug: 'jury-forge-test' }),
    );

    render(<SetupPage />);

    const link = await screen.findByRole('link', { name: /Sign in with GitHub/ });
    expect(link.getAttribute('href')).toBe('/api/auth/github/start');
    expect(link.getAttribute('target')).toBeNull();
    expect(link.getAttribute('rel')).toBeNull();
  });
});

describe('run detail links', () => {
  it('opens the posted review in a new tab', async () => {
    getRunMock.mockResolvedValue(RUN_DETAIL);
    listReviewersMock.mockResolvedValue([]);

    render(<RunDetailPage id="run-1" />);

    const link = await screen.findByRole('link', { name: /View on GitHub/ });
    expect(link.getAttribute('href')).toBe(RUN_DETAIL.run.reviewUrl);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });
});
