import { createAppAuth } from '@octokit/auth-app';

const API_BASE = 'https://api.github.com';
const OAUTH_TOKEN_URL = 'https://github.com/login/oauth/access_token';

export interface GitHubInstallation {
  id: number;
  account: {
    login: string;
    type: 'User' | 'Organization';
  };
}

export interface GitHubUser {
  login: string;
  id: number;
  avatarUrl: string | null;
}

export interface ManifestApp {
  appId: number;
  slug: string;
  clientId: string;
  clientSecret: string;
  webhookSecret: string;
  privateKey: string;
}

export async function convertManifest(code: string): Promise<ManifestApp> {
  const response = await fetch(`${API_BASE}/app-manifests/${code}/conversions`, {
    method: 'POST',
    headers: githubHeaders(),
  });
  const payload = await readJson<{
    id: number;
    slug: string;
    client_id: string;
    client_secret: string;
    webhook_secret: string;
    pem: string;
  }>(response);
  return {
    appId: payload.id,
    slug: payload.slug,
    clientId: payload.client_id,
    clientSecret: payload.client_secret,
    webhookSecret: payload.webhook_secret,
    privateKey: payload.pem,
  };
}

export async function listAppInstallations(
  appId: number,
  privateKey: string,
): Promise<GitHubInstallation[]> {
  const auth = createAppAuth({ appId, privateKey });
  const appAuthentication = await auth({ type: 'app' });
  const response = await fetch(`${API_BASE}/app/installations?per_page=100`, {
    headers: { ...githubHeaders(), Authorization: `Bearer ${appAuthentication.token}` },
  });
  return readJson<GitHubInstallation[]>(response);
}

export async function exchangeOAuthCode(
  clientId: string,
  clientSecret: string,
  code: string,
): Promise<string> {
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      ...githubHeaders(),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });
  const payload = await readJson<{ access_token?: string; error?: string }>(response);
  if (!payload.access_token) {
    throw new Error(payload.error ?? 'oauth_exchange_failed');
  }
  return payload.access_token;
}

export async function fetchUser(token: string): Promise<GitHubUser> {
  const response = await fetch(`${API_BASE}/user`, { headers: bearerHeaders(token) });
  const payload = await readJson<{ login: string; id: number; avatar_url: string | null }>(
    response,
  );
  return { login: payload.login, id: payload.id, avatarUrl: payload.avatar_url };
}

export async function fetchUserInstallations(
  token: string,
  page: number,
): Promise<{ totalCount: number; installationIds: number[] }> {
  const response = await fetch(`${API_BASE}/user/installations?per_page=100&page=${page}`, {
    headers: bearerHeaders(token),
  });
  const payload = await readJson<{ total_count: number; installations: { id: number }[] }>(
    response,
  );
  return {
    totalCount: payload.total_count,
    installationIds: payload.installations.map((installation) => installation.id),
  };
}

function githubHeaders(): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'jury-forge',
  };
}

function bearerHeaders(token: string): Record<string, string> {
  return { ...githubHeaders(), Authorization: `Bearer ${token}` };
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`github_request_failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export class GitHubApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
  }
}

export interface PullRequestInfo {
  title: string;
  body: string | null;
}

export interface PullFileEntry {
  filename: string;
  status: string;
  patch: string | null;
}

export interface PullFilePage {
  files: PullFileEntry[];
  done: boolean;
}

export const PULL_FILES_PAGE_SIZE = 100;

export async function createInstallationToken(
  appId: number,
  privateKey: string,
  installationId: number,
): Promise<string> {
  const auth = createAppAuth({ appId, privateKey });
  const installationAuthentication = await auth({ type: 'installation', installationId });
  return installationAuthentication.token;
}

export async function fetchPullRequest(
  token: string,
  fullName: string,
  prNumber: number,
): Promise<PullRequestInfo> {
  const response = await fetch(`${API_BASE}/repos/${fullName}/pulls/${prNumber}`, {
    headers: bearerHeaders(token),
  });
  const payload = await readJsonStrict<{ title: string; body: string | null }>(response);
  return { title: payload.title, body: payload.body };
}

export async function fetchPullFiles(
  token: string,
  fullName: string,
  prNumber: number,
  page: number,
): Promise<PullFilePage> {
  const response = await fetch(
    `${API_BASE}/repos/${fullName}/pulls/${prNumber}/files?per_page=${PULL_FILES_PAGE_SIZE}&page=${page}`,
    { headers: bearerHeaders(token) },
  );
  const payload =
    await readJsonStrict<{ filename: string; status: string; patch?: string }[]>(response);
  return {
    files: payload.map((file) => ({
      filename: file.filename,
      status: file.status,
      patch: file.patch ?? null,
    })),
    done: payload.length < PULL_FILES_PAGE_SIZE,
  };
}

export interface PullReviewRequest {
  commitId: string;
  body: string;
  comments: { path: string; line: number; body: string }[];
}

export async function createPullReview(
  token: string,
  fullName: string,
  prNumber: number,
  review: PullReviewRequest,
): Promise<string> {
  const response = await fetch(`${API_BASE}/repos/${fullName}/pulls/${prNumber}/reviews`, {
    method: 'POST',
    headers: { ...bearerHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      commit_id: review.commitId,
      body: review.body,
      event: 'COMMENT',
      comments: review.comments,
    }),
  });
  const payload = await readJsonStrict<{ html_url: string }>(response);
  return payload.html_url;
}

async function readJsonStrict<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new GitHubApiError(response.status, `github_request_failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}
