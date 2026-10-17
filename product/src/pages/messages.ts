/**
 * Screen-local error copy. The shared error taxonomy (`message(code)`) is slice D; until then a
 * screen must never print a machine code such as `request_failed` at the user, so every API code
 * these screens can receive is mapped to a human sentence here, and anything unrecognized falls
 * back to the caller's own human sentence.
 */
const CODE_MESSAGES: Record<string, string> = {
  unauthorized: 'Your session expired. Reload the page and sign in again.',
  request_failed: 'The dashboard API did not respond. Check the Worker and try again.',
  not_found: 'We could not find that item — it may have been deleted.',
  invalid_request: 'The server rejected that change. Check the fields and try again.',
  invalid_value: 'One of the values is out of range. Check the fields and try again.',
  unknown_key: 'The server did not recognize one of the fields. Reload the page and try again.',
  setup_required: 'This instance is not set up yet. Finish setup first.',
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
};

/** Map a known API code to a human sentence; otherwise use the caller's fallback sentence. */
export function humanMessage(code: string | null | undefined, fallback: string): string {
  if (typeof code === 'string' && code in CODE_MESSAGES) {
    return CODE_MESSAGES[code];
  }
  return fallback;
}

/**
 * Map a caught error to a human sentence. It reads `code` structurally rather than importing
 * `ApiError`, so a screen test can replace the API module wholesale without losing the mapping.
 * An unknown shape or code returns the fallback, never the raw code.
 */
export function errorMessage(caught: unknown, fallback: string): string {
  if (caught !== null && typeof caught === 'object' && 'code' in caught) {
    const { code } = caught as { code?: unknown };
    if (typeof code === 'string') {
      return humanMessage(code, fallback);
    }
  }
  return fallback;
}

/** Explain a reviewer's recorded failure in words instead of echoing its stored code. */
export function reviewerFailureMessage(error: string | null): string {
  if (error !== null && error.includes('provider_request_failed')) {
    return 'The model provider returned an error after several tries, so this reviewer did not finish. Check the provider URL, model, and key, then run again.';
  }
  return 'This reviewer did not finish. Check its provider, model, and key, then run again.';
}
