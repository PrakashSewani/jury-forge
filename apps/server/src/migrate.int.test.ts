// The `migrate` entrypoint end to end: a real process, a real PostgreSQL 17, and only the
// environment the container will give it (technical-approach §3.2, §14).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireContainerRuntime, startPostgres } from '@jury-forge/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const runtime = await requireContainerRuntime();
const ENTRYPOINT = fileURLToPath(new URL('./migrate.ts', import.meta.url));

let container: Awaited<ReturnType<typeof startPostgres>>;
let secretsDir: string;

function run(args: string[], env: Record<string, string>) {
  // Only PATH and SystemRoot from the parent, so no stray DATABASE_URL leaks into the run.
  const base: Record<string, string> = {};
  for (const key of ['PATH', 'Path', 'SystemRoot']) {
    const value = process.env[key];
    if (value !== undefined) base[key] = value;
  }
  const result = spawnSync(process.execPath, [ENTRYPOINT, ...args], {
    env: { ...base, ...env },
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe.runIf(runtime)('migrate entrypoint', () => {
  beforeAll(async () => {
    container = await startPostgres();
    secretsDir = mkdtempSync(join(tmpdir(), 'jf-migrate-'));
  });
  afterAll(async () => {
    await container?.stop();
    if (secretsDir) rmSync(secretsDir, { recursive: true, force: true });
  });

  it('applies the migrations from DATABASE_URL_FILE, then finds nothing left to apply', () => {
    const file = join(secretsDir, 'database_url');
    writeFileSync(file, `${container.getConnectionUri()}\n`, { mode: 0o600 });

    const first = run([], { DATABASE_URL_FILE: file });
    expect(first.stderr).toBe('');
    expect(first.code).toBe(0);
    expect(first.stdout).toContain('migrate: 6 migration(s) applied');
    const password = new URL(container.getConnectionUri()).password;
    expect(first.stdout).not.toContain(`:${password}@`);

    const second = run(['up'], { DATABASE_URL_FILE: file });
    expect(second.code).toBe(0);
    expect(second.stdout).toContain('migrate: 0 migration(s) applied');
  });

  it('exits 1 without printing the password when the database refuses the login', () => {
    const url = new URL(container.getConnectionUri());
    url.password = 'wrong-password-9f2c';
    const result = run([], { DATABASE_URL: url.toString() });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('migrate: failed:');
    expect(`${result.stdout}${result.stderr}`).not.toContain('wrong-password-9f2c');
  });

  it('refuses both URL forms and an unknown command', () => {
    const both = run([], { DATABASE_URL: container.getConnectionUri(), DATABASE_URL_FILE: '/x' });
    expect(both.code).toBe(1);
    expect(both.stderr).toContain('not both');
    expect(run(['down'], {}).code).toBe(2);
  });
});
