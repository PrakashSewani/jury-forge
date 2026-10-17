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

export interface CreatedPullReview {
  htmlUrl: string;
  reviewId: number;
}

export async function createPullReview(
  token: string,
  fullName: string,
  prNumber: number,
  review: PullReviewRequest,
): Promise<CreatedPullReview> {
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
  const payload = await readJsonStrict<{ id: number; html_url: string }>(response);
  return { htmlUrl: payload.html_url, reviewId: payload.id };
}

export interface PullReviewEntry {
  id: number;
  nodeId: string;
  authorLogin: string | null;
}

/** D-018: the PR's reviews, for minimizing the app's previous ones after a new post. */
export async function listPullReviews(
  token: string,
  fullName: string,
  prNumber: number,
): Promise<PullReviewEntry[]> {
  const response = await fetch(
    `${API_BASE}/repos/${fullName}/pulls/${prNumber}/reviews?per_page=100`,
    { headers: bearerHeaders(token) },
  );
  const payload =
    await readJsonStrict<{ id: number; node_id: string; user: { login?: string } | null }[]>(
      response,
    );
  return payload.map((review) => ({
    id: review.id,
    nodeId: review.node_id,
    authorLogin: review.user?.login ?? null,
  }));
}

/** GraphQL minimize with the `OUTDATED` classifier (D-018). */
export async function minimizeComment(token: string, nodeId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/graphql`, {
    method: 'POST',
    headers: { ...bearerHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query:
        'mutation ($id: ID!) { minimizeComment(input: { subjectId: $id, classifier: OUTDATED }) { minimizedComment { isMinimized } } }',
      variables: { id: nodeId },
    }),
  });
  await readJsonStrict<unknown>(response);
}

async function readJsonStrict<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new GitHubApiError(response.status, `github_request_failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export interface InstallationRepository {
  repoId: number;
  fullName: string;
  private: boolean;
}

export async function fetchInstallationRepositories(
  token: string,
  page: number,
): Promise<{ totalCount: number; repositories: InstallationRepository[] }> {
  const response = await fetch(`${API_BASE}/installation/repositories?per_page=100&page=${page}`, {
    headers: bearerHeaders(token),
  });
  const payload = await readJsonStrict<{
    total_count: number;
    repositories: { id: number; full_name: string; private: boolean }[];
  }>(response);
  return {
    totalCount: payload.total_count,
    repositories: payload.repositories.map((repository) => ({
      repoId: repository.id,
      fullName: repository.full_name,
      private: repository.private,
    })),
  };
}
