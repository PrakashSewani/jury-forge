// WP 1-02: the import-boundary rules reject the violations in scripts/fixtures/boundaries.
// This also guards against a silent pass: if dependency-cruiser cannot parse TypeScript, it
// cruises 0 modules and reports no violations, and these expectations fail.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { cruise, type IConfiguration, type ICruiseResult } from 'dependency-cruiser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const config = require('../.dependency-cruiser.cjs') as IConfiguration;
const fixtureRoot = fileURLToPath(new URL('./fixtures/boundaries/', import.meta.url));

describe('dependency rules', async () => {
  const reporting = await cruise(['apps', 'packages'], {
    baseDir: fixtureRoot,
    validate: true,
    ruleSet: { forbidden: config.forbidden ?? [] },
    tsPreCompilationDeps: true,
  });
  const result = reporting.output as ICruiseResult;
  const violations = result.summary.violations.map((v) => `${v.rule.name}: ${v.from} → ${v.to}`);

  it('parses the TypeScript fixtures', () => {
    expect(result.summary.totalCruised).toBeGreaterThanOrEqual(8);
  });

  it('reports exactly the deliberate violations', () => {
    expect(violations.sort()).toEqual(
      [
        'domain-imports-only-contracts: packages/domain/src/index.ts → packages/store/src/index.ts',
        'domain-no-io: packages/domain/src/index.ts → fs',
        'pipeline-uses-ports-not-implementations: packages/pipeline/src/index.ts → packages/gateway/src/index.ts',
        'testkit-only-in-tests: apps/server/src/main.ts → packages/testkit/src/index.ts',
      ].sort(),
    );
  });
});
