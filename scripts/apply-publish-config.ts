// Applies `publishConfig` to the workspace packages of a `pnpm deploy` output (WP 1-12).
//
// In the workspace each package exports its TypeScript source (`./src/index.ts`), so development
// and tests need no build. The image runs plain JS (technical-approach §3.1): the build emits
// `dist/`, and each runtime package names its JS entry in `publishConfig.exports`. pnpm 12's
// `deploy` honours the `files` field but copies `exports` unchanged (observed 2026-11-28), so the
// image build runs this script on the deploy directory.
//
// Usage: node scripts/apply-publish-config.ts <deploy-dir>

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SCOPE = '@jury-forge/';

export type Manifest = Record<string, unknown> & {
  name?: string;
  publishConfig?: Record<string, unknown>;
};

/** Moves every `publishConfig` field onto the manifest, then drops `publishConfig`. */
export function applyPublishConfig(manifest: Manifest): Manifest {
  const { publishConfig, ...rest } = manifest;
  if (publishConfig === undefined) return manifest;
  return { ...rest, ...publishConfig };
}

/** The workspace package manifests in a deploy directory: its root and the copies pnpm injected. */
export function deployedManifests(deployDir: string): string[] {
  const paths = [join(deployDir, 'package.json')];
  const store = join(deployDir, 'node_modules', '.pnpm');
  for (const entry of readdirSync(store)) {
    if (!entry.startsWith('@jury-forge+')) continue;
    const name = entry.slice('@jury-forge+'.length).split('@')[0] as string;
    paths.push(join(store, entry, 'node_modules', '@jury-forge', name, 'package.json'));
  }
  return paths;
}

/** The `.ts` files an `exports` field still points at; Node cannot run them from node_modules. */
export function typeScriptExports(exportsField: unknown): string[] {
  if (typeof exportsField === 'string') return exportsField.endsWith('.ts') ? [exportsField] : [];
  if (typeof exportsField !== 'object' || exportsField === null) return [];
  return Object.values(exportsField).flatMap((value) => typeScriptExports(value));
}

/**
 * Applies publishConfig in place and returns the packages it changed. Throws when a deployed
 * workspace package would still export TypeScript (WP 1-15a: a package without `files` and
 * `publishConfig.exports` was found only when the container failed to start).
 */
export function applyToDeploy(deployDir: string): string[] {
  const changed: string[] = [];
  for (const path of deployedManifests(deployDir)) {
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as Manifest;
    if (!manifest.name?.startsWith(SCOPE)) {
      throw new Error(`${path} is not a ${SCOPE} package`);
    }
    const applied = applyPublishConfig(manifest);
    const source = typeScriptExports(applied['exports']);
    if (source.length > 0) {
      throw new Error(
        `${manifest.name} would ship TypeScript exports (${source.join(', ')}); give it files, publishConfig.exports, a tsconfig.build.json, and a step in the root build script`,
      );
    }
    if (manifest.publishConfig === undefined) continue;
    writeFileSync(path, `${JSON.stringify(applied, null, 2)}\n`);
    changed.push(manifest.name);
  }
  return changed;
}

if (import.meta.main) {
  const [deployDir] = process.argv.slice(2);
  if (deployDir === undefined) {
    console.error('usage: node scripts/apply-publish-config.ts <deploy-dir>');
    process.exit(2);
  }
  const changed = applyToDeploy(deployDir);
  console.log(`publishConfig applied: ${changed.sort().join(', ') || 'none'}`);
}
