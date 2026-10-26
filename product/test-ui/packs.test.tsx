import type {
  PackCreateResult,
  PackDetail,
  PackManifest,
  PackPreview,
  PackSummary,
  PackVersionSummary,
  Repository,
  Reviewer,
} from '@jury-forge/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPack,
  getPack,
  getPackVersion,
  listPacks,
  listRepositories,
  listReviewers,
  previewPack,
  savePackGrants,
} from '../src/lib/api';
import PackDetailPage from '../src/pages/PackDetailPage';
import PacksPage from '../src/pages/PacksPage';
import { Nav } from '../src/shell/Nav';

vi.mock('../src/lib/api', () => ({
  listPacks: vi.fn(),
  previewPack: vi.fn(),
  createPack: vi.fn(),
  getPack: vi.fn(),
  getPackVersion: vi.fn(),
  savePackGrants: vi.fn(),
  listRepositories: vi.fn(),
  listReviewers: vi.fn(),
}));

const listPacksMock = vi.mocked(listPacks);
const previewPackMock = vi.mocked(previewPack);
const createPackMock = vi.mocked(createPack);
const getPackMock = vi.mocked(getPack);
const getPackVersionMock = vi.mocked(getPackVersion);
const savePackGrantsMock = vi.mocked(savePackGrants);
const listRepositoriesMock = vi.mocked(listRepositories);
const listReviewersMock = vi.mocked(listReviewers);

const pending = () => new Promise<never>(() => {});

const MANIFEST: PackManifest = {
  name: 'Docs style',
  description: 'House documentation conventions.',
  kind: 'skill',
  apply: 'paths',
  paths: ['docs/**'],
  neverQuote: ['docs/internal/**'],
  owner: 'Docs team',
};

const LATEST: PackVersionSummary = {
  id: 'version-1',
  hash: 'a'.repeat(64),
  manifestPath: 'SKILL.md',
  createdAt: 1_700_000_000,
  createdBy: 'octocat',
  manifestBytes: 120,
  docsBytes: 240,
  totalBytes: 360,
  fileCount: 2,
};

const PACK: PackSummary = {
  id: 'pack-1',
  slug: 'docs-style',
  name: 'Docs style',
  createdAt: 1_700_000_000,
  updatedAt: 1_700_000_100,
  grantCount: 1,
  latest: { ...LATEST, manifest: MANIFEST },
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
  rules: '',
  flavor: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-5',
  params: {},
  enabled: true,
  hasApiKey: true,
  repositories: ['prakashsewani/jury-forge'],
};

const DETAIL: PackDetail = {
  pack: PACK,
  versions: [{ ...LATEST }],
  grants: [
    {
      id: 'grant-global',
      scope: 'global',
      targetId: null,
      targetLabel: null,
      precedence: 100,
      enabled: true,
    },
  ],
  latest: {
    ...LATEST,
    manifest: MANIFEST,
    body: 'Use sentence case for headings.',
    files: [
      { path: 'docs/a.md', bytes: 12, neverQuote: false },
      { path: 'docs/internal/b.md', bytes: 14, neverQuote: true },
    ],
  },
};

const PREVIEW: PackPreview = {
  valid: true,
  errors: [],
  warnings: ['A preview warning.'],
  manifest: MANIFEST,
  hash: LATEST.hash,
  files: [{ path: 'docs/a.md', bytes: 12, neverQuote: false }],
  ignoredFiles: [],
  ignoredCount: 0,
  candidates: [],
  existingPack: null,
};

const CREATED: PackCreateResult = {
  pack: PACK,
  version: LATEST,
  createdVersion: true,
};

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('PacksPage', () => {
  it('shows a loading state', () => {
    listPacksMock.mockReturnValue(pending());
    render(<PacksPage />);
    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('explains the pack shape when the list is empty', async () => {
    listPacksMock.mockResolvedValue([]);
    render(<PacksPage />);
    expect(await screen.findByText('No knowledge packs yet')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Add a pack' }).length).toBeGreaterThan(0);
  });

  it('lists a pack with its slug, kind, version and grants', async () => {
    listPacksMock.mockResolvedValue([PACK]);
    render(<PacksPage />);
    expect(await screen.findByRole('link', { name: 'Docs style' })).toBeTruthy();
    expect(screen.getByText('docs-style')).toBeTruthy();
    expect(screen.getByText('skill')).toBeTruthy();
    expect(screen.getByText('@aaaaaaa')).toBeTruthy();
    expect(screen.getByText(/2 docs ·/)).toBeTruthy();
  });

  it('filters the list and offers a way back', async () => {
    const user = userEvent.setup();
    listPacksMock.mockResolvedValue([PACK]);
    render(<PacksPage />);
    await screen.findByRole('link', { name: 'Docs style' });
    await user.type(screen.getByLabelText('Search packs'), 'nothing');
    expect(await screen.findByText('No matching packs')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(await screen.findByRole('link', { name: 'Docs style' })).toBeTruthy();
  });

  it('opens the upload dialog with both input paths', async () => {
    const user = userEvent.setup();
    listPacksMock.mockResolvedValue([]);
    render(<PacksPage />);
    await screen.findByText('No knowledge packs yet');
    await user.click(screen.getAllByRole('button', { name: 'Add a pack' })[0] as HTMLElement);
    expect(await screen.findByLabelText('Choose a folder')).toBeTruthy();
    expect(screen.getByLabelText('Choose a zip')).toBeTruthy();
    expect(screen.getByText(/sent to the configured model provider/)).toBeTruthy();
  });

  it('previews a folder upload and stores it', async () => {
    const user = userEvent.setup();
    listPacksMock.mockResolvedValue([]);
    previewPackMock.mockResolvedValue(PREVIEW);
    createPackMock.mockResolvedValue(CREATED);
    render(<PacksPage />);
    await screen.findByText('No knowledge packs yet');
    await user.click(screen.getAllByRole('button', { name: 'Add a pack' })[0] as HTMLElement);
    const input = await screen.findByLabelText('Choose a folder');
    await user.upload(input, new File([MANIFEST.name], 'SKILL.md'));
    expect(await screen.findByText('Store pack')).toBeTruthy();
    expect(previewPackMock).toHaveBeenCalledWith(
      expect.objectContaining({ files: [expect.objectContaining({ path: 'SKILL.md' })] }),
    );
    await user.click(screen.getByRole('button', { name: 'Store pack' }));
    await waitFor(() => expect(createPackMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(window.location.pathname).toBe('/packs/pack-1'));
  });
});

describe('PackDetailPage', () => {
  it('shows the manifest, docs and withheld files', async () => {
    getPackMock.mockResolvedValue(DETAIL);
    listRepositoriesMock.mockResolvedValue([REPO]);
    listReviewersMock.mockResolvedValue([REVIEWER]);
    render(<PackDetailPage id="pack-1" />);
    expect(await screen.findByRole('heading', { name: 'Docs style' })).toBeTruthy();
    expect(screen.getByText('House documentation conventions.')).toBeTruthy();
    expect(screen.getByText('docs/a.md')).toBeTruthy();
    expect(screen.getByText('docs/internal/b.md')).toBeTruthy();
    expect(screen.getByText('withheld')).toBeTruthy();
    expect(screen.getByText('Manifest body')).toBeTruthy();
  });

  it('adds a reviewer grant and saves the full replacement', async () => {
    const user = userEvent.setup();
    getPackMock.mockResolvedValue(DETAIL);
    listRepositoriesMock.mockResolvedValue([REPO]);
    listReviewersMock.mockResolvedValue([REVIEWER]);
    savePackGrantsMock.mockResolvedValue([
      DETAIL.grants[0]!,
      {
        id: 'grant-reviewer',
        scope: 'reviewer',
        targetId: 'rev-security',
        targetLabel: 'Security',
        precedence: 300,
        enabled: true,
      },
    ]);
    render(<PackDetailPage id="pack-1" />);
    expect(await screen.findByText('Every repository and reviewer')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Add reviewer' }));
    expect(screen.getByText('reviewer')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Save grants' }));
    await waitFor(() =>
      expect(savePackGrantsMock).toHaveBeenCalledWith('pack-1', [
        { scope: 'global', targetId: null, precedence: 100, enabled: true },
        { scope: 'reviewer', targetId: 'rev-security', precedence: 300, enabled: true },
      ]),
    );
  });

  it('opens the version upload dialog with the pack slug', async () => {
    const user = userEvent.setup();
    getPackMock.mockResolvedValue(DETAIL);
    listRepositoriesMock.mockResolvedValue([REPO]);
    listReviewersMock.mockResolvedValue([REVIEWER]);
    getPackVersionMock.mockResolvedValue({
      ...LATEST,
      manifest: MANIFEST,
      body: 'Version body.',
      files: [{ path: 'docs/a.md', bytes: 12, neverQuote: false, text: 'Alpha.' }],
    });
    render(<PackDetailPage id="pack-1" />);
    await screen.findByRole('heading', { name: 'Docs style' });
    await user.click(screen.getByRole('button', { name: 'Upload a new version' }));
    expect(await screen.findByText('Upload a version of docs-style')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'View' }));
    expect(await screen.findByText('Alpha.')).toBeTruthy();
  });
});

describe('navigation', () => {
  it('links to Knowledge and marks it active for the pack screens', () => {
    render(<Nav route={{ name: 'packs' }} />);
    const link = screen.getByRole('link', { name: 'Knowledge' });
    expect(link.getAttribute('href')).toBe('/packs');
    expect(link.getAttribute('aria-current')).toBe('page');
  });
});
