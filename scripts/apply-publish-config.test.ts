import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyPublishConfig, applyToDeploy } from './apply-publish-config.ts';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

describe('applyPublishConfig', () => {
  it('moves publishConfig fields onto the manifest and drops publishConfig', () => {
    expect(
      applyPublishConfig({
        name: '@jury-forge/store',
        exports: { '.': './src/index.ts' },
        files: ['dist'],
        publishConfig: { exports: { '.': './dist/index.js' } },
      }),
    ).toEqual({ name: '@jury-forge/store', exports: { '.': './dist/index.js' }, files: ['dist'] });
  });

  it('leaves a manifest without publishConfig unchanged', () => {
    const manifest = { name: '@jury-forge/testkit', exports: { '.': './src/index.ts' } };
    expect(applyPublishConfig(manifest)).toBe(manifest);
  });
});

describe('applyToDeploy', () => {
  it('rewrites the deploy root and every injected @jury-forge package, nothing else', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jf-deploy-'));
    dirs.push(dir);
    const injected = (name: string) =>
      join(
        dir,
        'node_modules',
        '.pnpm',
        `@jury-forge+${name}@file+_abc123`,
        'node_modules',
        '@jury-forge',
        name,
      );
    const pg = join(dir, 'node_modules', '.pnpm', 'pg@8.23.1', 'node_modules', 'pg');
    for (const path of [injected('store'), injected('domain'), pg])
      mkdirSync(path, { recursive: true });
    const publish = { exports: { '.': './dist/index.js' } };
    writeJson(join(dir, 'package.json'), {
      name: '@jury-forge/server',
      exports: { '.': './src/index.ts' },
      publishConfig: publish,
    });
    writeJson(join(injected('store'), 'package.json'), {
      name: '@jury-forge/store',
      exports: { '.': './src/index.ts' },
      publishConfig: publish,
    });
    writeJson(join(injected('domain'), 'package.json'), {
      name: '@jury-forge/domain',
      exports: { '.': './src/index.ts' },
    });
    writeJson(join(pg, 'package.json'), { name: 'pg', publishConfig: { tag: 'latest' } });

    expect(applyToDeploy(dir).sort()).toEqual(['@jury-forge/server', '@jury-forge/store']);
    const read = (path: string) =>
      JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')) as Record<string, unknown>;
    expect(read(dir)['exports']).toEqual({ '.': './dist/index.js' });
    expect(read(injected('store'))['exports']).toEqual({ '.': './dist/index.js' });
    expect(read(injected('domain'))['exports']).toEqual({ '.': './src/index.ts' });
    expect(read(pg)['publishConfig']).toEqual({ tag: 'latest' });
  });
});
