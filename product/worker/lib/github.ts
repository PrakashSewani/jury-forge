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
