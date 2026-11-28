// The `app` role's HTTP servers (technical-approach §3.5):
// - the main server (port 3000 on the internal network, behind Caddy);
// - the setup server (`SETUP_BIND`, loopback by default): `/healthz` only so far. The bootstrap and
//   setup routes, the origin step among them, arrive with WP 1-15 and WP 1-16.
//
// Internal routes (`/healthz`, `/readyz`, `/api/internal/tls/allow`) are for the Docker network.
// They skip `Host` pinning, and they refuse any request that came through a proxy: Caddy adds
// forwarding headers to everything it proxies, and the Caddyfile also blocks these paths.
// Every other route is pinned to the origin (ADR-0021): 503 `origin_unset` before one exists, and
// 421 for any other `Host`. The `Host` header never defines the origin.
//
// `/healthz` is liveness and checks nothing (observability.md §9). `/readyz` is 200 when the
// process's own dependencies are ok and 503 otherwise, with a breakdown and never an error
// message. The origin and TLS state are reported in the body and do not fail readiness, so the
// stack can start before setup (owner decision, 2026-11-28).

import { hostOf } from '@jury-forge/domain';
import type { StoreReadiness } from '@jury-forge/store';
import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
  type FastifyRequest,
} from 'fastify';
import type { AskDecision, OriginReadiness, OriginState } from './origin-service.ts';

export const APP_PORT = 3000;

export interface Readiness {
  status: 'ready' | 'not_ready';
  components: StoreReadiness;
  origin: OriginReadiness | { state: 'error' };
}

export interface OriginPort {
  current(): Promise<OriginState>;
  ask(domain: string): Promise<AskDecision>;
  readiness(): Promise<OriginReadiness>;
}

export interface AppServerOptions {
  logger: FastifyBaseLogger;
  readiness: () => Promise<StoreReadiness>;
  origin: OriginPort;
}

declare module 'fastify' {
  interface FastifyContextConfig {
    internal?: boolean;
  }
}

const FORWARDING_HEADERS = [
  'forwarded',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'via',
];

export function buildAppServer(options: AppServerOptions): FastifyInstance {
  const app = Fastify({ loggerInstance: options.logger });
  const { origin } = options;

  // Routing runs before onRequest, so the route's own flag decides, not a path prefix.
  app.addHook('onRequest', async (request, reply) => {
    if (request.routeOptions.config.internal === true) {
      if (cameThroughProxy(request)) return reply.code(404).send({ error: 'not_found' });
      return;
    }
    let state: OriginState;
    try {
      state = await origin.current();
    } catch (error) {
      request.log.error({ err: error }, 'cannot read the origin setting');
      return reply.code(503).send({ error: 'unavailable' });
    }
    if (state.origin === null) return reply.code(503).send({ error: 'origin_unset' });
    if (hostOf(request.headers.host ?? '') !== state.origin.host) {
      return reply.code(421).send({ error: 'misdirected_request' });
    }
  });

  addHealthz(app, true);

  // The healthcheck probes this every 10 s; only warnings and errors are logged for it.
  app.get('/readyz', { logLevel: 'warn', config: { internal: true } }, async (request, reply) => {
    const [components, originReadiness] = await Promise.all([
      options.readiness(),
      origin.readiness().catch((error: unknown) => {
        request.log.warn({ err: error }, 'cannot read the origin state');
        return { state: 'error' as const };
      }),
    ]);
    const ready =
      Object.values(components).every((state) => state === 'ok') &&
      originReadiness.state !== 'error';
    const body: Readiness = {
      status: ready ? 'ready' : 'not_ready',
      components,
      origin: originReadiness,
    };
    return reply
      .code(ready ? 200 : 503)
      .header('cache-control', 'no-store')
      .send(body);
  });

  // Caddy's on-demand TLS `ask` (deployment.md §4): 200 allows a certificate, anything else refuses.
  app.get<{ Querystring: { domain?: string } }>(
    '/api/internal/tls/allow',
    { config: { internal: true } },
    async (request, reply) => {
      const domain = request.query.domain;
      if (typeof domain !== 'string' || domain === '') {
        return reply.code(400).send({ error: 'domain_required' });
      }
      let decision: AskDecision;
      try {
        decision = await origin.ask(domain);
      } catch (error) {
        request.log.error({ err: error }, 'tls ask: cannot read the origin setting');
        return reply.code(503).send({ allow: false, reason: 'unavailable' });
      }
      request.log.info({ domain, decision }, 'tls ask');
      if (decision === 'allow') return reply.code(200).send({ allow: true });
      return reply
        .code(decision === 'rate_limited' ? 429 : 403)
        .send({ allow: false, reason: decision });
    },
  );

  return app;
}

export function buildSetupServer(options: { logger: FastifyBaseLogger }): FastifyInstance {
  const app = Fastify({ loggerInstance: options.logger });
  addHealthz(app, false);
  return app;
}

function addHealthz(app: FastifyInstance, internal: boolean): void {
  app.get('/healthz', { logLevel: 'warn', config: { internal } }, async (_request, reply) =>
    reply.header('cache-control', 'no-store').send({ status: 'ok' }),
  );
}

function cameThroughProxy(request: FastifyRequest): boolean {
  return FORWARDING_HEADERS.some((name) => request.headers[name] !== undefined);
}
