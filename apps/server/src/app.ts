// The `app` role (deployment.md §3): the main HTTP server on port 3000 and the setup listener on
// `SETUP_BIND`. In Compose, port 3000 is only on the internal network (`expose`, no `ports`), and
// the setup port is published on host loopback only. The image runs it as `main.js app`.
// It refuses to start when the master key does not open the key probe (WP 1-15a).

import { checkReadiness, createStore } from '@jury-forge/store';
import type { Logger } from 'pino';
import { EnvError, loadRoleEnv, type RoleEnv } from './env.ts';
import { APP_PORT, type AppComponents, buildAppServer, buildSetupServer } from './http.ts';
import { createLogger } from './logger.ts';
import {
  MasterKeyCheckError,
  masterKeyReadiness,
  verifyMasterKeyAtStart,
} from './master-key-check.ts';
import { OriginService } from './origin-service.ts';
import { waitForSignal } from './shutdown.ts';
import { createTlsProbe, type TlsProbe } from './tls-probe.ts';

export interface RunningApp {
  /** The bound addresses, for tests that listen on port 0. */
  appPort: number;
  setupPort: number;
  stop: () => Promise<void>;
}

export interface StartAppOptions {
  env: RoleEnv;
  logger: Logger;
  /** Defaults to 3000; tests pass 0. */
  appPort?: number;
  /** Defaults to 0.0.0.0, the container's interfaces; tests pass 127.0.0.1. */
  appHost?: string;
  /** Defaults to a TLS handshake with `caddy:443`; tests pass a fake. */
  tlsProbe?: TlsProbe;
}

export async function startApp(options: StartAppOptions): Promise<RunningApp> {
  const { env, logger } = options;
  const store = createStore({ databaseUrl: env.databaseUrl, maxConnections: 5 });
  try {
    await verifyMasterKeyAtStart(store, env.masterKey);
  } catch (error) {
    await store.destroy();
    throw error;
  }
  const origin = new OriginService({
    store,
    publicUrl: env.publicUrl,
    probe: options.tlsProbe ?? createTlsProbe(),
  });
  const app = buildAppServer({
    logger,
    origin,
    readiness: async (): Promise<AppComponents> => {
      const components = await checkReadiness(store, {
        onError: (component, error) =>
          logger.warn({ component, err: error }, 'readiness check failed'),
      });
      const masterKey =
        components.database === 'ok'
          ? await masterKeyReadiness(store, env.masterKey).catch((error: unknown) => {
              logger.warn({ component: 'master_key', err: error }, 'readiness check failed');
              return 'error' as const;
            })
          : 'error';
      return { ...components, master_key: masterKey };
    },
  });
  const setup = buildSetupServer({ logger: logger.child({ listener: 'setup' }) });
  const stop = async () => {
    await Promise.allSettled([app.close(), setup.close()]);
    await store.destroy();
  };
  try {
    await app.listen({ host: options.appHost ?? '0.0.0.0', port: options.appPort ?? APP_PORT });
    if (!env.setupBind.loopback) {
      logger.warn(
        { setupBind: `${env.setupBind.host}:${env.setupBind.port}` },
        'SETUP_BIND is not loopback: publish it on host loopback only (127.0.0.1:8080:8080)',
      );
    }
    await setup.listen({ host: env.setupBind.host, port: env.setupBind.port });
  } catch (error) {
    await stop();
    throw error;
  }
  if (env.publicUrl !== null) {
    logger.info({ origin: env.publicUrl.url }, 'PUBLIC_URL freezes the origin');
  }
  return { appPort: portOf(app.server.address()), setupPort: portOf(setup.server.address()), stop };
}

/** `main.js app`: runs until SIGTERM or SIGINT. Exit 1 on a bad environment or a failed bind. */
export async function runApp(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<number> {
  if (argv.length > 0) {
    process.stderr.write('usage: app\n');
    return 2;
  }
  let roleEnv: RoleEnv;
  try {
    roleEnv = loadRoleEnv(env);
  } catch (error) {
    if (error instanceof EnvError) {
      process.stderr.write(`app: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
  const logger = createLogger(roleEnv.logLevel, 'app');
  const { signal, dispose } = waitForSignal();
  let running: RunningApp;
  try {
    running = await startApp({ env: roleEnv, logger });
  } catch (error) {
    dispose();
    if (error instanceof MasterKeyCheckError) {
      logger.fatal({ code: error.code }, error.message);
    } else {
      logger.fatal({ err: error }, 'app failed to start');
    }
    return 1;
  }
  logger.info('app started');
  const received = await signal;
  logger.info({ signal: received }, 'app stopping');
  await running.stop();
  logger.info('app stopped');
  return 0;
}

function portOf(address: ReturnType<import('node:net').Server['address']>): number {
  return typeof address === 'object' && address !== null ? address.port : 0;
}
