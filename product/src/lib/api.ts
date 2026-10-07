import type {
  InstallationInfo,
  ProviderFlavor,
  Repository,
  RepositoryReviewer,
  RepositoryReviewerUpdate,
  Reviewer,
  RunDetail,
  RunsPage,
  SessionUser,
  SetupCodeResponse,
  SetupState,
} from '@jury-forge/shared';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string) {
    super(code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function errorFrom(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return new ApiError(response.status, body?.error ?? 'request_failed');
}

export async function fetchSession(): Promise<SessionUser | null> {
  const response = await fetch('/api/auth/session');
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw await errorFrom(response);
  }
  return (await response.json()) as SessionUser;
}

export async function fetchSetupState(): Promise<SetupState> {
  const response = await fetch('/api/setup/state');
  if (!response.ok) {
    throw await errorFrom(response);
  }
  return (await response.json()) as SetupState;
}

export async function submitSetupCode(
  code: string,
  org: string | null,
): Promise<SetupCodeResponse> {
  const response = await fetch('/api/setup/code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(org === null ? { code } : { code, org }),
  });
  if (!response.ok) {
    throw await errorFrom(response);
  }
  return (await response.json()) as SetupCodeResponse;
}

export async function verifyInstallation(): Promise<InstallationInfo> {
  const response = await fetch('/api/setup/verify-installation', { method: 'POST' });
  if (!response.ok) {
    throw await errorFrom(response);
  }
  return (await response.json()) as InstallationInfo;
}

export async function logOut(): Promise<void> {
  const response = await fetch('/api/auth/logout', { method: 'POST' });
  if (!response.ok) {
    throw await errorFrom(response);
  }
}

const jsonHeaders = { 'Content-Type': 'application/json' };

/**
 * Dashboard request helper: a 401 means the session is gone (e.g. it expired), so notify the
 * shell — it re-checks the session and shows the sign-in gate.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (response.status === 401) {
    window.dispatchEvent(new Event('jf:unauthorized'));
    throw new ApiError(401, 'unauthorized');
  }
  if (!response.ok) {
    throw await errorFrom(response);
  }
  return (await response.json()) as T;
}

export interface ReviewerDraft {
  name: string;
  instructions: string;
  rules: string;
  flavor: ProviderFlavor;
  baseUrl: string;
  model: string;
  params: Record<string, unknown>;
  enabled: boolean;
}

export interface ReviewerCreateInput extends ReviewerDraft {
  apiKey?: string;
}

export interface ReviewerUpdateInput extends Partial<ReviewerDraft> {
  apiKey?: string | null;
}

export function listReviewers(): Promise<Reviewer[]> {
  return request('/api/reviewers');
}

export function getReviewer(id: string): Promise<Reviewer> {
  return request(`/api/reviewers/${encodeURIComponent(id)}`);
}

export function createReviewer(input: ReviewerCreateInput): Promise<Reviewer> {
  return request('/api/reviewers', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(input),
  });
}

export function updateReviewer(id: string, input: ReviewerUpdateInput): Promise<Reviewer> {
  return request(`/api/reviewers/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify(input),
  });
}

export async function deleteReviewer(id: string): Promise<void> {
  const response = await fetch(`/api/reviewers/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (response.status === 401) {
    window.dispatchEvent(new Event('jf:unauthorized'));
    throw new ApiError(401, 'unauthorized');
  }
  if (!response.ok) {
    throw await errorFrom(response);
  }
}

export function listRepositories(refresh = false): Promise<Repository[]> {
  return request(`/api/repositories${refresh ? '?refresh=1' : ''}`);
}

export function setRepositoryEnabled(repoId: number, enabled: boolean): Promise<Repository> {
  return request(`/api/repositories/${repoId}`, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify({ enabled }),
  });
}

export function getRepositoryReviewers(repoId: number): Promise<RepositoryReviewer[]> {
  return request(`/api/repositories/${repoId}/reviewers`);
}

export function saveRepositoryReviewers(
  repoId: number,
  reviewers: RepositoryReviewerUpdate[],
): Promise<RepositoryReviewer[]> {
  return request(`/api/repositories/${repoId}/reviewers`, {
    method: 'PUT',
    headers: jsonHeaders,
    body: JSON.stringify({ reviewers }),
  });
}

export function listRuns(cursor?: string): Promise<RunsPage> {
  const query = cursor === undefined ? '' : `?cursor=${encodeURIComponent(cursor)}`;
  return request(`/api/runs${query}`);
}

export function getRun(id: string): Promise<RunDetail> {
  return request(`/api/runs/${encodeURIComponent(id)}`);
}
