// Harness proof for WP 1-03: a real PostgreSQL 17 container starts and answers a query.
import { requireContainerRuntime, startPostgres } from '@jury-forge/testkit';
import pg from 'pg';
import { describe, expect, it } from 'vitest';

const runtime = await requireContainerRuntime();

describe.runIf(runtime)('testcontainers PostgreSQL', () => {
  it('starts PostgreSQL 17 and answers a query', async () => {
    const container = await startPostgres();
    const client = new pg.Client({ connectionString: container.getConnectionUri() });
    try {
      await client.connect();
      const result = await client.query<{ version: string }>(
        "select current_setting('server_version_num') as version",
      );
      const version = Number(result.rows[0]?.version);
      expect(version).toBeGreaterThanOrEqual(170000);
      expect(version).toBeLessThan(180000);
    } finally {
      await client.end();
      await container.stop();
    }
  });
});
