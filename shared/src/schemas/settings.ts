import { z } from 'zod';

/** Every instance setting (D-021); bounds are validated at write time, not here. */
export const InstanceSettingsSchema = z.object({
  inlineCommentsPerReviewer: z.number(),
  inlineCommentsPerRun: z.number(),
  contextTotalBytes: z.number(),
  contextFileBytes: z.number(),
  descriptionLimit: z.number(),
  blockingMode: z.boolean(),
  blockingErrorThreshold: z.number(),
  repoInstructions: z.boolean(),
  repoInstructionsMaxBytes: z.number(),
});

/** `GET`/`PATCH /api/settings`. */
export const SettingsResponseSchema = z.object({
  settings: InstanceSettingsSchema,
  defaults: InstanceSettingsSchema,
});
