// The Kysely types in db.generated.ts are generated from the migrated schema and checked in
// (technical-approach §3.2; the AGENTS.md exception for CI-verified codegen, owner decision
// 2026-11-28). This test regenerates them from a fresh PostgreSQL 17 and fails on any difference.
// To update the file after a migration change:
//   pnpm exec vitest run --project integration -u packages/store/src/db.generated.int.test.ts
import { requireContainerRuntime, startPostgres } from '@jury-forge/testkit';
import { Kysely, PostgresDialect } from 'kysely';
import { PostgresDialect as CodegenPostgresDialect, generate } from 'kysely-codegen';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { migrate } from './migrations.ts';

const runtime = await requireContainerRuntime();

describe.runIf(runtime)('generated database types', () => {
  it('match the migrated schema', async () => {
    const container = await startPostgres();
    const db = new Kysely<unknown>({
      dialect: new PostgresDialect({
        pool: new pg.Pool({ connectionString: container.getConnectionUri() }),
      }),
    });
    try {
      await migrate({ databaseUrl: container.getConnectionUri() });
      const output = await generate({
        db,
        dialect: new CodegenPostgresDialect(),
        excludePattern: 'public.pgmigrations',
        outFile: null,
      });
      await expect(output).toMatchFileSnapshot('./db.generated.ts');
    } finally {
      await db.destroy();
      await container.stop();
    }
  });
});
