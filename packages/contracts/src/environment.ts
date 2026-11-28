// Layer 1 of the configuration model: the environment (technical-approach §14; operations.md §3).
// One zod schema checks the variables' shape. The values that need parsing beyond shape (the origin,
// the listen address, the database URL, the key file) are parsed by their own modules in the app,
// because `contracts` imports nothing else. An empty value counts as unset. Issues name the
// variable and never echo its value.

import { z } from 'zod';

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const optional = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().trim().min(1).optional(),
);

/** The variables the `app` and `worker` roles read (the complete v1 list, minus later ones). */
export const RoleEnvironmentSchema = z
  .object({
    DATABASE_URL: optional,
    DATABASE_URL_FILE: optional,
    JURY_MASTER_KEY_FILE: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string({ error: 'is required: the path to the master key file' }).trim().min(1),
    ),
    LOG_LEVEL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.enum(LOG_LEVELS, { error: `must be one of ${LOG_LEVELS.join(', ')}` }).default('info'),
    ),
    SETUP_BIND: optional,
    PUBLIC_URL: optional,
  })
  .refine((env) => !(env.DATABASE_URL !== undefined && env.DATABASE_URL_FILE !== undefined), {
    path: ['DATABASE_URL'],
    error: 'set DATABASE_URL_FILE or DATABASE_URL, not both',
  })
  .refine((env) => env.DATABASE_URL !== undefined || env.DATABASE_URL_FILE !== undefined, {
    path: ['DATABASE_URL_FILE'],
    error: 'is required (preferred), or DATABASE_URL',
  });

export type RoleEnvironment = z.output<typeof RoleEnvironmentSchema>;

export type EnvironmentResult =
  | { ok: true; env: RoleEnvironment }
  | { ok: false; problems: string[] };

/** Checks the environment's shape. Problems read `<VARIABLE> <what is wrong>`. */
export function parseRoleEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): EnvironmentResult {
  const result = RoleEnvironmentSchema.safeParse(env);
  if (result.success) return { ok: true, env: result.data };
  return {
    ok: false,
    problems: result.error.issues.map(
      (issue) => `${String(issue.path[0] ?? 'environment')} ${issue.message}`,
    ),
  };
}
