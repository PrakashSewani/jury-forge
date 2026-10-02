import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { network } from './network';

beforeAll(() => network.enable());
afterEach(() => network.resetHandlers());
afterAll(() => network.disable());

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
