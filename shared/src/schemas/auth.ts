import { z } from 'zod';

/** The signed-in user as stored in `sessions` and returned by `GET /api/auth/session`. */
export const SessionUserSchema = z.object({
  login: z.string(),
  avatarUrl: z.string().nullable(),
});
