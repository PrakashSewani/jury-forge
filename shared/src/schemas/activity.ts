import { z } from 'zod';

/** One audit-trail row. */
export const ActivityEntrySchema = z.object({
  id: z.number(),
  at: z.number(),
  actor: z.string(),
  action: z.string(),
  target: z.string().nullable(),
  detail: z.string().nullable(),
});

/** `GET /api/activity`. */
export const ActivityPageSchema = z.object({
  activity: z.array(ActivityEntrySchema),
  nextCursor: z.string().nullable(),
});
