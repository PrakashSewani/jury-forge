import type { ApiErrorCode } from '@jury-forge/shared';
import type { ZodType } from 'zod';

/** The Vite/Cloudflare worker environment flags `strict()` reads. */
export interface RespondEnv {
  MODE?: string;
  PROD?: boolean;
}

/**
 * Parsing is ON in test and dev, and OFF only in a real production build. An unknown or absent
 * mode means STRICT (parse), never silently lax.
 */
export function strict(
  env: RespondEnv | undefined = (import.meta as ImportMeta & { env?: RespondEnv }).env,
): boolean {
  return env?.MODE === 'test' || env?.PROD !== true;
}

/**
 * Validate `data` against `schema` in strict mode, then serialize it as JSON. A validation failure
 * throws so a drifted response fails the worker suite loudly; the unvalidated body is never
 * returned. In production the data is returned unparsed. `parse` is an explicit test seam; by
 * default it comes from `strict()`.
 */
export function respond<T>(
  schema: ZodType<T>,
  data: T,
  status = 200,
  parse: boolean = strict(),
): Response {
  if (parse) {
    schema.parse(data);
  }
  return Response.json(data, { status });
}

/** The `{ error: code }` body every worker error uses, typed so a typo cannot compile. */
export function errorResponse(code: ApiErrorCode, status: number): Response {
  return Response.json({ error: code }, { status });
}
