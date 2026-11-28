// The image entrypoint: `node /app/dist/main.js <command>` (technical-approach §3.13: one image for
// the `migrate`, `app`, and `worker` containers). The command is the role; the image reads no
// `ROLE` variable. `healthcheck` is the containers' probe, since the distroless image has no curl.

import { runApp } from './app.ts';
import { runHealthcheck } from './healthcheck.ts';
import { runMigrate } from './migrate.ts';
import { runWorker } from './worker.ts';

const USAGE = `usage: main.js <command>
  migrate            apply pending database migrations, then exit
  app                serve HTTP: /healthz and /readyz, and the setup listener on SETUP_BIND
  worker             take queue jobs and run cron
  healthcheck <url>  exit 0 if a loopback URL answers 200
`;

export async function dispatch(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case 'migrate':
      return runMigrate(rest);
    case 'app':
      return runApp(rest);
    case 'worker':
      return runWorker(rest);
    case 'healthcheck':
      return runHealthcheck(rest);
    default:
      process.stderr.write(USAGE);
      return 2;
  }
}

if (import.meta.main) {
  process.exitCode = await dispatch(process.argv.slice(2));
}
