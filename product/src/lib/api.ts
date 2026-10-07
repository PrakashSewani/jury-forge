import type {
  InstallationInfo,
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
