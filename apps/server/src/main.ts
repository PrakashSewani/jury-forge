// The image entrypoint: `node apps/server/dist/main.js <command>` (technical-approach §3.13: one
// image for the `migrate`, `app`, and `worker` containers). M1.2 ships `migrate`; `app` and
// `worker` arrive with the setup and queue wiring of later milestones.

import { runMigrate } from './migrate.ts';

const USAGE =
  'usage: main.js <command>\n  migrate   apply pending database migrations, then exit\n';

export async function dispatch(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case 'migrate':
      return runMigrate(rest);
    default:
      process.stderr.write(USAGE);
      return 2;
  }
}

if (import.meta.main) {
  process.exitCode = await dispatch(process.argv.slice(2));
}
