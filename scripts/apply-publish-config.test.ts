import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyPublishConfig, applyToDeploy, typeScriptExports } from './apply-publish-config.ts';

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

describe('typeScriptExports', () => {
  it('finds .ts targets in string, subpath, and condition forms', () => {
    expect(typeScriptExports('./src/index.ts')).toEqual(['./src/index.ts']);
    expect(typeScriptExports('./dist/index.js')).toEqual([]);
    expect(
      typeScriptExports({
        '.': './dist/index.js',
        './x': { import: './src/x.ts', default: './x.js' },
      }),
    ).toEqual(['./src/x.ts']);
    expect(typeScriptExports(undefined)).toEqual([]);
    expect(typeScriptExports(null)).toEqual([]);
  });
});

describe('applyToDeploy', () => {
  const injected = (dir: string, name: string) =>
    join(
      dir,
      'node_modules',
      '.pnpm',
      `@jury-forge+${name}@file+_abc123`,
      'node_modules',
      '@jury-forge',
      name,
    );
  const publish = { exports: { '.': './dist/index.js' } };

  function deployDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'jf-deploy-'));
    dirs.push(dir);
    writeJson(join(dir, 'package.json'), {
      name: '@jury-forge/server',
      exports: { '.': './src/index.ts' },
      publishConfig: publish,
    });
    return dir;
  }

  it('rewrites the deploy root and every injected @jury-forge package, nothing else', () => {
    const dir = deployDir();
    const pg = join(dir, 'node_modules', '.pnpm', 'pg@8.23.1', 'node_modules', 'pg');
    for (const path of [injected(dir, 'store'), injected(dir, 'contracts'), pg]) {
      mkdirSync(path, { recursive: true });
    }
    writeJson(join(injected(dir, 'store'), 'package.json'), {
      name: '@jury-forge/store',
      exports: { '.': './src/index.ts' },
      publishConfig: publish,
    });
    // Already plain JS with nothing to apply: left as it is.
    writeJson(join(injected(dir, 'contracts'), 'package.json'), {
      name: '@jury-forge/contracts',
      exports: { '.': './dist/index.js' },
    });
    writeJson(join(pg, 'package.json'), { name: 'pg', publishConfig: { tag: 'latest' } });

    expect(applyToDeploy(dir).sort()).toEqual(['@jury-forge/server', '@jury-forge/store']);
    const read = (path: string) =>
      JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')) as Record<string, unknown>;
    expect(read(dir)['exports']).toEqual({ '.': './dist/index.js' });
    expect(read(injected(dir, 'store'))['exports']).toEqual({ '.': './dist/index.js' });
    expect(read(injected(dir, 'contracts'))['exports']).toEqual({ '.': './dist/index.js' });
    expect(read(pg)['publishConfig']).toEqual({ tag: 'latest' });
  });

  it('refuses a workspace package that would ship TypeScript exports', () => {
    const dir = deployDir();
    mkdirSync(injected(dir, 'crypto'), { recursive: true });
    writeJson(join(injected(dir, 'crypto'), 'package.json'), {
      name: '@jury-forge/crypto',
      exports: { '.': './src/index.ts' },
    });
    expect(() => applyToDeploy(dir)).toThrow('@jury-forge/crypto would ship TypeScript exports');
  });
});
