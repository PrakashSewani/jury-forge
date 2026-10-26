import type {
  ActivityPage,
  ApiErrorCode,
  InstallationInfo,
  InstanceReadiness,
  InstanceSettings,
  PackCreateResult,
  PackDetail,
  PackGrant,
  PackGrantInput,
  PackPreview,
  PackPreviewRequest,
  PackSummary,
  PackVersionDetail,
  ProviderFlavor,
  Repository,
  RepositoryPullRequest,
  RepositoryReviewer,
  RepositoryReviewerUpdate,
  Reviewer,
  ReviewersExportDocument,
  ReviewersImportResult,
  RunDetail,
  RunsPage,
  ScopePreviewRequest,
  ScopePreviewResponse,
  SessionUser,
  SettingsResponse,
  SetupCodeResponse,
  SetupState,
  TryRunRequest,
  TryRunResponse,
} from '@jury-forge/shared';
import {
  ActivityPageSchema,
  ApiErrorSchema,
  InstallationInfoSchema,
  InstanceReadinessSchema,
  PackCreateResultSchema,
  PackDetailSchema,
  PackGrantSchema,
  PackPreviewSchema,
  PackSummarySchema,
  PackVersionDetailSchema,
  RepositoryPullRequestSchema,
  RepositoryReviewerSchema,
  RepositorySchema,
  ReviewerSchema,
  ReviewersExportDocumentSchema,
  ReviewersImportResultSchema,
  RunDetailSchema,
  RunsPageSchema,
  ScopePreviewResponseSchema,
  SessionUserSchema,
  SettingsResponseSchema,
  SetupCodeResponseSchema,
  SetupStateSchema,
  TryRunResponseSchema,
} from '@jury-forge/shared';
import { z } from 'zod';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(status: number, code: ApiErrorCode) {
    super(code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const ReviewerListSchema = z.array(ReviewerSchema);
const PackListSchema = z.array(PackSummarySchema);
const PackGrantListSchema = z.array(PackGrantSchema);
const RepositoryListSchema = z.array(RepositorySchema);
const RepositoryReviewerListSchema = z.array(RepositoryReviewerSchema);
const RepositoryPullRequestListSchema = z.array(RepositoryPullRequestSchema);

/**
 * Read the `{ error: code }` body. A code that is not in the union (or a body that is not the
 * expected shape at all) degrades to `request_failed`, as the dashboard did before.
 */
async function errorFrom(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null);
  const parsed = ApiErrorSchema.safeParse(body);
  return new ApiError(response.status, parsed.success ? parsed.data.error : 'request_failed');
}

/**
 * Dashboard request helper. A 401 means the session is gone (e.g. it expired), so notify the
 * shell — it re-checks the session and shows the sign-in gate. A success body that does not
 * match `schema` throws `invalid_response`; the unvalidated body never reaches a component.
 */
async function request<T>(schema: z.ZodType<T>, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (response.status === 401) {
    window.dispatchEvent(new Event('jf:unauthorized'));
    throw new ApiError(401, 'unauthorized');
  }
  if (!response.ok) {
    throw await errorFrom(response);
  }
  const body: unknown = await response.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(response.status, 'invalid_response');
  }
  return parsed.data;
}

export async function fetchSession(signal?: AbortSignal): Promise<SessionUser | null> {
  const response = await fetch('/api/auth/session', { signal });
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw await errorFrom(response);
  }
  const body: unknown = await response.json().catch(() => null);
  const parsed = SessionUserSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(response.status, 'invalid_response');
  }
  return parsed.data;
}

export function fetchSetupState(signal?: AbortSignal): Promise<SetupState> {
  return request(SetupStateSchema, '/api/setup/state', { signal });
}

export function submitSetupCode(
  code: string,
  org: string | null,
  signal?: AbortSignal,
): Promise<SetupCodeResponse> {
  return request(SetupCodeResponseSchema, '/api/setup/code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(org === null ? { code } : { code, org }),
    signal,
  });
}

export function verifyInstallation(signal?: AbortSignal): Promise<InstallationInfo> {
  return request(InstallationInfoSchema, '/api/setup/verify-installation', {
    method: 'POST',
    signal,
  });
}

export async function logOut(signal?: AbortSignal): Promise<void> {
  const response = await fetch('/api/auth/logout', { method: 'POST', signal });
  if (response.status === 401) {
    window.dispatchEvent(new Event('jf:unauthorized'));
    throw new ApiError(401, 'unauthorized');
  }
  if (!response.ok) {
    throw await errorFrom(response);
  }
}

const jsonHeaders = { 'Content-Type': 'application/json' };

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
  /** Copy the key already stored on another reviewer instead of pasting it again. */
  apiKeyFromReviewerId?: string;
}

export interface ReviewerUpdateInput extends Partial<ReviewerDraft> {
  apiKey?: string | null;
  /** Copy the key already stored on another reviewer instead of pasting it again. */
  apiKeyFromReviewerId?: string;
}

export function listReviewers(signal?: AbortSignal): Promise<Reviewer[]> {
  return request(ReviewerListSchema, '/api/reviewers', { signal });
}

export function exportReviewers(signal?: AbortSignal): Promise<ReviewersExportDocument> {
  return request(ReviewersExportDocumentSchema, '/api/reviewers/export', { signal });
}

export function importReviewers(
  input: unknown,
  signal?: AbortSignal,
): Promise<ReviewersImportResult> {
  return request(ReviewersImportResultSchema, '/api/reviewers/import', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(input),
    signal,
  });
}

/** Turns an exported document into a downloaded JSON file. */
export function downloadReviewersExport(exportDocument: ReviewersExportDocument): void {
  const blob = new Blob([JSON.stringify(exportDocument, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'jury-forge-reviewers.json';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function getReviewer(id: string, signal?: AbortSignal): Promise<Reviewer> {
  return request(ReviewerSchema, `/api/reviewers/${encodeURIComponent(id)}`, { signal });
}

export function createReviewer(
  input: ReviewerCreateInput,
  signal?: AbortSignal,
): Promise<Reviewer> {
  return request(ReviewerSchema, '/api/reviewers', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(input),
    signal,
  });
}

export function updateReviewer(
  id: string,
  input: ReviewerUpdateInput,
  signal?: AbortSignal,
): Promise<Reviewer> {
  return request(ReviewerSchema, `/api/reviewers/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify(input),
    signal,
  });
}

export async function deleteReviewer(id: string, signal?: AbortSignal): Promise<void> {
  const response = await fetch(`/api/reviewers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    signal,
  });
  if (response.status === 401) {
    window.dispatchEvent(new Event('jf:unauthorized'));
    throw new ApiError(401, 'unauthorized');
  }
  if (!response.ok) {
    throw await errorFrom(response);
  }
}

/**
 * The repository list, narrowed server-side when `q` is set: the worker matches `full_name` and the
 * term travels in the URL, so the enabled/reviewer toggles keep working on what the query returned.
 * `q` is appended after `signal` on purpose — the three existing callers stay as they are.
 */
export function listRepositories(
  refresh = false,
  signal?: AbortSignal,
  q = '',
): Promise<Repository[]> {
  const params = new URLSearchParams();
  if (refresh) {
    params.set('refresh', '1');
  }
  const term = q.trim();
  if (term !== '') {
    params.set('q', term);
  }
  const query = params.toString();
  return request(RepositoryListSchema, `/api/repositories${query === '' ? '' : `?${query}`}`, {
    signal,
  });
}

export function setRepositoryEnabled(
  repoId: number,
  enabled: boolean,
  signal?: AbortSignal,
): Promise<Repository> {
  return request(RepositorySchema, `/api/repositories/${repoId}`, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify({ enabled }),
    signal,
  });
}

export function getRepositoryReviewers(
  repoId: number,
  signal?: AbortSignal,
): Promise<RepositoryReviewer[]> {
  return request(RepositoryReviewerListSchema, `/api/repositories/${repoId}/reviewers`, {
    signal,
  });
}

export function saveRepositoryReviewers(
  repoId: number,
  reviewers: RepositoryReviewerUpdate[],
  signal?: AbortSignal,
): Promise<RepositoryReviewer[]> {
  return request(RepositoryReviewerListSchema, `/api/repositories/${repoId}/reviewers`, {
    method: 'PUT',
    headers: jsonHeaders,
    body: JSON.stringify({ reviewers }),
    signal,
  });
}

/** D-032: match patterns against the newest run's changed files for this repository. */
export function previewScope(
  repoId: number,
  input: ScopePreviewRequest,
  signal?: AbortSignal,
): Promise<ScopePreviewResponse> {
  return request(ScopePreviewResponseSchema, `/api/repositories/${repoId}/scope-preview`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(input),
    signal,
  });
}

export function listOpenPullRequests(
  repoId: number,
  signal?: AbortSignal,
): Promise<RepositoryPullRequest[]> {
  return request(RepositoryPullRequestListSchema, `/api/repositories/${repoId}/pulls`, {
    signal,
  });
}

export function listRuns(cursor?: string, signal?: AbortSignal): Promise<RunsPage> {
  const query = cursor === undefined ? '' : `?cursor=${encodeURIComponent(cursor)}`;
  return request(RunsPageSchema, `/api/runs${query}`, { signal });
}

export function getRun(id: string, signal?: AbortSignal): Promise<RunDetail> {
  return request(RunDetailSchema, `/api/runs/${encodeURIComponent(id)}`, { signal });
}

export function startTryRun(input: TryRunRequest, signal?: AbortSignal): Promise<TryRunResponse> {
  return request(TryRunResponseSchema, '/api/runs/try', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(input),
    signal,
  });
}

export function getReadiness(signal?: AbortSignal): Promise<InstanceReadiness> {
  return request(InstanceReadinessSchema, '/api/instance/readiness', { signal });
}

export function getSettings(signal?: AbortSignal): Promise<SettingsResponse> {
  return request(SettingsResponseSchema, '/api/settings', { signal });
}

export function listActivity(cursor?: string, signal?: AbortSignal): Promise<ActivityPage> {
  const query = cursor === undefined ? '' : `?cursor=${encodeURIComponent(cursor)}`;
  return request(ActivityPageSchema, `/api/activity${query}`, { signal });
}

export function updateSettings(
  patch: Partial<InstanceSettings>,
  signal?: AbortSignal,
): Promise<SettingsResponse> {
  return request(SettingsResponseSchema, '/api/settings', {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify(patch),
    signal,
  });
}

export function listPacks(signal?: AbortSignal): Promise<PackSummary[]> {
  return request(PackListSchema, '/api/packs', { signal });
}

export function previewPack(input: PackPreviewRequest, signal?: AbortSignal): Promise<PackPreview> {
  return request(PackPreviewSchema, '/api/packs/preview', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(input),
    signal,
  });
}

export function createPack(
  input: PackPreviewRequest,
  signal?: AbortSignal,
): Promise<PackCreateResult> {
  return request(PackCreateResultSchema, '/api/packs', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(input),
    signal,
  });
}

export function getPack(id: string, signal?: AbortSignal): Promise<PackDetail> {
  return request(PackDetailSchema, `/api/packs/${encodeURIComponent(id)}`, { signal });
}

export function getPackVersion(
  packId: string,
  versionId: string,
  signal?: AbortSignal,
): Promise<PackVersionDetail> {
  return request(
    PackVersionDetailSchema,
    `/api/packs/${encodeURIComponent(packId)}/versions/${encodeURIComponent(versionId)}`,
    { signal },
  );
}

export function savePackGrants(
  packId: string,
  grants: PackGrantInput[],
  signal?: AbortSignal,
): Promise<PackGrant[]> {
  return request(PackGrantListSchema, `/api/packs/${encodeURIComponent(packId)}/grants`, {
    method: 'PUT',
    headers: jsonHeaders,
    body: JSON.stringify({ grants }),
    signal,
  });
}
