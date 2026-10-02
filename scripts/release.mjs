#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [, , bumpArg, ...flags] = process.argv;
const dryRun = flags.includes('--dry-run');

const BUMPS = ['patch', 'minor', 'major'];

if (!bumpArg || !BUMPS.includes(bumpArg)) {
  console.error(`Usage: node scripts/release.mjs <${BUMPS.join('|')}> [--dry-run]`);
  process.exit(1);
}

const root = resolve(import.meta.dirname, '..');
const packageJsonPath = resolve(root, 'package.json');
const lockfilePath = resolve(root, 'package-lock.json');
const changelogPath = resolve(root, 'CHANGELOG.md');

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const [major, minor, patch] = packageJson.version.split('.').map(Number);
const next = {
  patch: `${major}.${minor}.${patch + 1}`,
  minor: `${major}.${minor + 1}.0`,
  major: `${major + 1}.0.0`,
}[bumpArg];

const date = new Date().toISOString().slice(0, 10);
const unreleasedHeading = '## [Unreleased]';
const changelog = readFileSync(changelogPath, 'utf8');
const headingStart = changelog.indexOf(unreleasedHeading);
if (headingStart === -1) {
  console.error(`CHANGELOG.md has no "${unreleasedHeading}" section to release.`);
  process.exit(1);
}
const afterHeading = headingStart + unreleasedHeading.length;
const nextHeading = changelog.indexOf('\n## [', afterHeading);
const sectionEnd = nextHeading === -1 ? changelog.length : nextHeading;
const body = changelog.slice(afterHeading, sectionEnd).trim();
const rest = changelog.slice(sectionEnd).replace(/^\n+/, '');
const nextSection = `${unreleasedHeading}\n\n## [${next}] - ${date}\n\n${body}\n`;
const nextChangelog = `${changelog.slice(0, headingStart)}${nextSection}${rest ? `\n${rest}` : ''}`;

console.log(`Current: ${packageJson.version} -> Next: ${next} (${bumpArg})`);

if (dryRun) {
  console.log('[dry run] Package manifests and CHANGELOG.md were not written.');
  process.exit(0);
}

packageJson.version = next;
writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

const lockfile = JSON.parse(readFileSync(lockfilePath, 'utf8'));
lockfile.version = next;
if (lockfile.packages?.['']) {
  lockfile.packages[''].version = next;
}
writeFileSync(lockfilePath, `${JSON.stringify(lockfile, null, 2)}\n`);

writeFileSync(changelogPath, nextChangelog);

console.log(`Updated package.json, package-lock.json, and CHANGELOG.md for v${next}.`);
