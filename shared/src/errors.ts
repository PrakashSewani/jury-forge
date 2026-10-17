import { z } from 'zod';

/**
 * Every error code the Worker can emit, plus the dashboard-side codes it can raise itself
 * (`request_failed`, `invalid_response`, `provider_request_failed`). Kept as a tuple so
 * `ApiErrorCode` and `ApiErrorCodeSchema` derive from one source.
 */
export const API_ERROR_CODES = [
  'invalid_request',
  'not_found',
  'encryption_key_unset',
  'setup_required',
  'setup_session_required',
  'already_claimed',
  'kick_failed',
  'invalid_state',
  'invalid_code',
  'invalid_signature',
  'missing_signature',
  'internal_error',
  'cross_origin',
  'app_missing',
  'unauthorized',
  'unknown_key',
  'invalid_value',
  'reviewer_unavailable',
  'provider_request_failed',
  'access_denied',
  'installation_required',
  'invalid_response',
  'request_failed',
  'setup_code_unset',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const ApiErrorCodeSchema = z.enum(API_ERROR_CODES);

/** The shape of every error body: `{ "error": "<code>" }`. */
export const ApiErrorSchema = z.object({ error: ApiErrorCodeSchema });

/**
 * Human sentences for every code. The setup-flow codes copy `product/src/lib/wizard.ts` verbatim
 * and the rest copy `product/src/pages/messages.ts`, so the shared taxonomy never changes a
 * screen's copy. `message()` never returns a raw code.
 */
export const API_ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  unauthorized: 'Your session expired. Reload the page and sign in again.',
  not_found: 'We could not find that item — it may have been deleted.',
  invalid_request: 'The request was rejected. Try again.',
  invalid_value: 'One of the values is out of range. Check the fields and try again.',
  unknown_key: 'The server did not recognize one of the fields. Reload the page and try again.',
  setup_required: 'This instance is not set up yet. Finish setup first.',
  setup_session_required:
    'The setup session expired or was lost. Re-enter the setup code to continue.',
  setup_code_unset:
    'This instance has no SETUP_CODE secret yet. Set it with "npx wrangler secret put SETUP_CODE" and reload.',
  encryption_key_unset:
    'This instance has no ENCRYPTION_KEY secret yet. Set it with "npx wrangler secret put ENCRYPTION_KEY" and reload.',
  internal_error: 'The Worker hit an unexpected error. Try again.',
  cross_origin: 'That request was blocked as cross-origin. Reload the page and try again.',
  kick_failed: 'The Worker could not start the run. Try again.',
  reviewer_unavailable:
    'One of the reviewers you picked is not ready — it must be enabled and hold a model key.',
  provider_request_failed:
    'The model provider returned an error, so the run could not finish. Check the provider URL, model, and key, then run again.',
  already_claimed: 'This instance is already claimed. Sign in to open the dashboard.',
  app_missing: 'No GitHub App is registered on this instance yet. Start from the setup code step.',
  invalid_code:
    'That code does not match the SETUP_CODE secret on this instance. Check the value with "npx wrangler secret put SETUP_CODE".',
  invalid_state: 'That link expired or was already used. Start again from the setup code step.',
  invalid_signature: 'GitHub rejected the webhook signature.',
  missing_signature: 'The webhook had no signature.',
  installation_required:
    'Sign-in finished, but no installation exists yet. Install the app on your account, then try the claim again.',
  access_denied:
    "Your GitHub account cannot access this instance's installation. Sign in as the owner, or as a member of the organization the app is installed on.",
  invalid_response:
    'The dashboard received an unexpected response from the Worker. Reload the page and try again.',
  request_failed: 'Something went wrong. Try again.',
};

function isApiErrorCode(code: string): code is ApiErrorCode {
  return (API_ERROR_CODES as readonly string[]).includes(code);
}

/**
 * Map a known code to its human sentence. An unknown code, a missing code or a non-string returns
 * the caller's fallback when given, otherwise the generic `request_failed` sentence. It never
 * returns a raw machine code.
 */
export function message(code: ApiErrorCode | string | null | undefined, fallback?: string): string {
  if (typeof code === 'string' && isApiErrorCode(code)) {
    return API_ERROR_MESSAGES[code];
  }
  return fallback ?? API_ERROR_MESSAGES.request_failed;
}
