import { z } from 'zod';

/** The GitHub App manifest submitted to GitHub during setup. */
export const AppManifestSchema = z.object({
  name: z.string(),
  url: z.string(),
  hook_attributes: z.object({ url: z.string(), active: z.boolean() }),
  redirect_url: z.string(),
  callback_urls: z.array(z.string()),
  public: z.boolean(),
  default_permissions: z.record(z.string(), z.string()),
  default_events: z.array(z.string()),
});

/** `GET /api/setup/state`. */
export const SetupStateSchema = z.object({
  claimed: z.boolean(),
  appCreated: z.boolean(),
  installed: z.boolean(),
  appSlug: z.string().nullable(),
});

/** `POST /api/setup/code`. */
export const SetupCodeResponseSchema = z.object({
  actionsUrl: z.string(),
  state: z.string(),
  manifest: AppManifestSchema,
});

/** `POST /api/setup/verify-installation`; `account` is null when no installation exists yet. */
export const InstallationInfoSchema = z.object({
  installed: z.boolean(),
  account: z.object({ login: z.string(), type: z.enum(['user', 'org']) }).nullable(),
});
