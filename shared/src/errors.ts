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
 * Human sentences for every code. Every code a dashboard screen already mapped carries exactly the
 * sentence `product/src/pages/messages.ts` rendered before this slice, and the codes only the setup
 * flow maps (`setup_session_required`, `installation_required`, `access_denied`) carry
 * `product/src/lib/wizard.ts`'s wording — so the one shared taxonomy changes no screen's copy.
 * `message()` never returns a raw code.
 */
export const API_ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  unauthorized: 'Your session expired. Reload the page and sign in again.',
  not_found: 'We could not find that item — it may have been deleted.',
  invalid_request: 'The server rejected that change. Check the fields and try again.',
  invalid_value: 'One of the values is out of range. Check the fields and try again.',
  unknown_key: 'The server did not recognize one of the fields. Reload the page and try again.',
  setup_required: 'This instance is not set up yet. Finish setup first.',
  setup_session_required:
    'The setup session expired or was lost. Re-enter the setup code to continue.',
  setup_code_unset: 'This instance has no setup code configured. Check the Worker secrets.',
  encryption_key_unset: 'This instance is missing its encryption key. Check the Worker secrets.',
  internal_error: 'The Worker hit an unexpected error. Try again.',
  cross_origin: 'That request was blocked as cross-origin. Reload the page and try again.',
  kick_failed: 'The Worker could not start the run. Try again.',
  reviewer_unavailable:
    'One of the reviewers you picked is not ready — it must be enabled and hold a model key.',
  provider_request_failed:
    'The model provider returned an error, so the run could not finish. Check the provider URL, model, and key, then run again.',
  already_claimed: 'This instance has already been claimed.',
  app_missing: 'The GitHub App is not registered yet. Finish setup first.',
  invalid_code: 'That setup code was not accepted. Check it and try again.',
  invalid_state: 'That link is no longer valid. Start the step again.',
  invalid_signature: 'GitHub rejected the webhook signature.',
  missing_signature: 'The webhook had no signature.',
  installation_required:
    'Sign-in finished, but no installation exists yet. Install the app on your account, then try the claim again.',
  access_denied:
    "Your GitHub account cannot access this instance's installation. Sign in as the owner, or as a member of the organization the app is installed on.",
  invalid_response:
    'The dashboard received an unexpected response from the Worker. Reload the page and try again.',
  request_failed: 'The dashboard API did not respond. Check the Worker and try again.',
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
