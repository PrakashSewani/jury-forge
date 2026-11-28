// The `app` role's HTTP servers (technical-approach §3.5). WP 1-13 serves only health:
// - the main server (port 3000 on the internal network, behind Caddy): `/healthz` and `/readyz`;
// - the setup server (`SETUP_BIND`, loopback by default): `/healthz`. The bootstrap and setup
//   routes arrive with WP 1-15 and WP 1-16.
// `/healthz` is liveness and checks nothing (observability.md §9). `/readyz` is readiness: 200 when
// every component is `ok`, otherwise 503, with the component breakdown and never an error message.

import type { StoreReadiness } from '@jury-forge/store';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';

export const APP_PORT = 3000;

export interface Readiness {
  status: 'ready' | 'not_ready';
  components: StoreReadiness;
}

export interface AppServerOptions {
  logger: FastifyBaseLogger;
  readiness: () => Promise<StoreReadiness>;
}

export function buildAppServer(options: AppServerOptions): FastifyInstance {
  const app = Fastify({ loggerInstance: options.logger });
  addHealthz(app);
  // The healthcheck probes this every 10 s; only warnings and errors are logged for it.
  app.get('/readyz', { logLevel: 'warn' }, async (_request, reply) => {
    const components = await options.readiness();
    const ready = Object.values(components).every((state) => state === 'ok');
    const body: Readiness = { status: ready ? 'ready' : 'not_ready', components };
    return reply
      .code(ready ? 200 : 503)
      .header('cache-control', 'no-store')
      .send(body);
  });
  return app;
}

export function buildSetupServer(options: { logger: FastifyBaseLogger }): FastifyInstance {
  const app = Fastify({ loggerInstance: options.logger });
  addHealthz(app);
  return app;
}

function addHealthz(app: FastifyInstance): void {
  app.get('/healthz', { logLevel: 'warn' }, async (_request, reply) =>
    reply.header('cache-control', 'no-store').send({ status: 'ok' }),
  );
}
