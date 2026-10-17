import { message } from '@jury-forge/shared';

/**
 * Map a caught error to a human sentence. It reads `code` structurally rather than importing
 * `ApiError`, so a screen test can replace the API module wholesale without losing the mapping.
 * The code-to-sentence map lives in `@jury-forge/shared`; an unknown shape or code returns the
 * caller's fallback, never the raw code.
 */
export function errorMessage(caught: unknown, fallback: string): string {
  if (caught !== null && typeof caught === 'object' && 'code' in caught) {
    const { code } = caught as { code?: unknown };
    if (typeof code === 'string') {
      return message(code, fallback);
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
