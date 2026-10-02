import type { SessionUser } from '@jury-forge/shared';
import type { MiddlewareHandler } from 'hono';
import { readSession, sessionIdFromCookie } from './lib/sessions';

export type AppEnv = {
  Bindings: Env;
  Variables: {
    user: SessionUser;
  };
};

export function requireSession(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const sessionId = sessionIdFromCookie(c.req.raw);
    const user = sessionId ? await readSession(c.env.DB, sessionId) : null;
    if (!user) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    c.set('user', user);
    await next();
  };
}

export function sameOrigin(): MiddlewareHandler {
  return async (c, next) => {
    const method = c.req.method;
    if (method !== 'GET' && method !== 'HEAD') {
      const site = c.req.header('Sec-Fetch-Site');
      const origin = c.req.header('Origin');
      if (site !== 'same-origin' && origin !== new URL(c.req.url).origin) {
        return c.json({ error: 'cross_origin' }, 403);
      }
    }
    await next();
  };
}
