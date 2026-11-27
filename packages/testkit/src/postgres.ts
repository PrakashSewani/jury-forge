import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

/** PostgreSQL 17 is the only datastore (ADR-0004). Renovate keeps this tag current. */
export const POSTGRES_IMAGE = 'postgres:17.12-alpine';

/** Starts a throwaway PostgreSQL container. The caller stops it. */
export async function startPostgres(): Promise<StartedPostgreSqlContainer> {
  return new PostgreSqlContainer(POSTGRES_IMAGE).start();
}
