#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';

const repoRoot = resolve(import.meta.dirname, '..');
const productDir = resolve(repoRoot, 'product');
const wranglerJsonc = resolve(productDir, 'wrangler.jsonc');
const DATABASE_NAME = 'jury-forge';

const SECRETS = [
  { name: 'ENCRYPTION_KEY', bytes: 32 },
  { name: 'SETUP_CODE', bytes: 24 },
];

export const THE_STEPS = [
  {
    id: 'auth',
    description: 'Check that wrangler is authenticated',
    command: 'npx wrangler whoami',
  },
  {
    id: 'database',
    description:
      'Find the D1 database "jury-forge" (create it when missing: npx wrangler d1 create jury-forge)',
    command: 'npx wrangler d1 list --json',
  },
  {
    id: 'secrets',
    description:
      'Set any missing ENCRYPTION_KEY and SETUP_CODE secrets (npx wrangler secret put <NAME>)',
    command: 'npx wrangler secret list --json',
    cwd: 'product',
  },
  {
    id: 'migrations',
    description: 'Apply D1 migrations to the remote database',
    command: 'npx wrangler d1 migrations apply jury-forge --remote',
    cwd: 'product',
  },
  {
    id: 'deploy',
    description: 'Build and deploy the product Worker',
    command: 'npm run deploy --workspace @jury-forge/product',
  },
  {
    id: 'report',
    description: 'Print the /setup URL and the next steps',
    command: null,
  },
];

export function secretValue(bytes) {
  return randomBytes(bytes).toString('base64');
}

/** Replaces the first `database_id` value without disturbing the JSONC comments. */
export function replaceDatabaseId(source, databaseId) {
  const pattern = /("database_id"\s*:\s*")[^"]*(")/;
  if (!pattern.test(source)) {
    throw new Error('No "database_id" entry found in product/wrangler.jsonc.');
  }
  return source.replace(pattern, (_match, prefix, suffix) => `${prefix}${databaseId}${suffix}`);
}

export function wizardUrl(origin) {
  return `${origin.replace(/\/+$/, '')}/setup`;
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Tolerant database-id reader: JSON field, then a bare UUID, then `database_id = "<uuid>"`. */
export function parseDatabaseId(output) {
  const text = output ?? '';
  const parsed = tryParseJson(text.trim());
  if (parsed && typeof parsed === 'object') {
    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') {
        continue;
      }
      for (const field of ['uuid', 'database_id', 'id']) {
        if (typeof candidate[field] === 'string' && candidate[field] !== '') {
          return candidate[field];
        }
      }
    }
  }
  const uuid = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (uuid) {
    return uuid[0];
  }
  const labeled = text.match(/database_id\s*=\s*"?([0-9a-f-]{36})"?/i);
  if (labeled) {
    return labeled[1];
  }
  throw new Error(`Could not read the database id from wrangler output:\n${text}`);
}

export function parseOrigin(output) {
  const match = (output ?? '').match(/https:\/\/[a-z0-9][a-z0-9.-]*\.workers\.dev\b/i);
  return match ? match[0] : null;
}

function databaseExists(output) {
  const parsed = tryParseJson((output ?? '').trim());
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.result)
      ? parsed.result
      : null;
  if (list !== null) {
    return list.some((entry) => entry && entry.name === DATABASE_NAME);
  }
  return (output ?? '').includes(DATABASE_NAME);
}

/** Returns the listed secret names, or null when the output cannot be understood. */
function parseSecretList(output) {
  const parsed = tryParseJson((output ?? '').trim());
  if (!Array.isArray(parsed)) {
    return null;
  }
  const names = new Set();
  for (const entry of parsed) {
    if (entry && typeof entry.name === 'string') {
      names.add(entry.name);
    }
  }
  return names;
}

function printPlan() {
  console.log('Jury Forge guided deploy — dry run (nothing will change)\n');
  THE_STEPS.forEach((step, index) => {
    console.log(`${index + 1}. ${step.id} — ${step.description}`);
    if (step.command === null) {
      console.log('   (reports the instance origin and next steps)');
    } else {
      const where = step.cwd ? ` (in ${step.cwd}/)` : '';
      console.log(`   $ ${step.command}${where}`);
    }
  });
}

function usage() {
  console.log(`Usage: node scripts/deploy-guided.mjs [--dry-run] [--yes] [--help]

Walks a new operator through the first-run deploy: wrangler auth, the D1 database,
the instance secrets, remote migrations, and the product deploy.

Options:
  --dry-run  Print every step and exit without changing anything
  --yes      Skip the confirmation prompt
  --help     Show this help

Deployments are manual; run this from a checkout, never from CI.`);
}

/**
 * Runs one shell command, streaming its output as it arrives. When `input` is given it is written
 * to the command's stdin (used for secret values, which are never placed on the command line).
 */
function runCommand(command, { cwd = repoRoot, input } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: [input === undefined ? 'inherit' : 'pipe', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
      process.stderr.write(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => resolvePromise({ code: code ?? 1, output }));
    if (input !== undefined) {
      child.stdin.end(input);
    }
  });
}

/** Runs a command and exits non-zero as soon as it fails, naming the command. */
async function runStep(command, options) {
  const { code, output } = await runCommand(command, options);
  if (code !== 0) {
    console.error(`\nCommand failed: ${command}`);
    process.exit(code);
  }
  return output;
}

async function confirm() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      'This will check wrangler auth, find or create the "jury-forge" D1 database, set any ' +
        'missing ENCRYPTION_KEY/SETUP_CODE secrets, apply remote migrations, and deploy the ' +
        'product. Continue? [y/N] ',
    );
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

async function stepAuth() {
  console.log('\n1/6 Checking wrangler authentication…');
  const { code } = await runCommand('npx wrangler whoami');
  if (code !== 0) {
    console.error(
      '\nwrangler is not authenticated. Run `npx wrangler login` or set CLOUDFLARE_API_TOKEN.',
    );
    process.exit(1);
  }
}

async function stepDatabase() {
  console.log('\n2/6 Ensuring the D1 database…');
  const listOutput = await runStep('npx wrangler d1 list --json');
  if (databaseExists(listOutput)) {
    console.log(`D1 database "${DATABASE_NAME}" already exists — leaving wrangler.jsonc as-is.`);
    return;
  }
  console.log(`D1 database "${DATABASE_NAME}" not found — creating it…`);
  const createOutput = await runStep(`npx wrangler d1 create ${DATABASE_NAME}`);
  const databaseId = parseDatabaseId(createOutput);
  const before = readFileSync(wranglerJsonc, 'utf8');
  writeFileSync(wranglerJsonc, replaceDatabaseId(before, databaseId));
  console.log(`Wrote the new database id into product/wrangler.jsonc (${databaseId}).`);
}

async function stepSecrets() {
  console.log('\n3/6 Ensuring the instance secrets…');
  const listed = await runCommand('npx wrangler secret list --json', { cwd: productDir });
  if (listed.code !== 0) {
    console.log('\nCould not list the instance secrets — nothing was changed.');
    console.log('An existing secret must never be overwritten. Set any missing ones manually:');
    for (const secret of SECRETS) {
      console.log(
        `  npx wrangler secret put ${secret.name}   # ${secret.bytes} random bytes, base64`,
      );
    }
    return;
  }
  const names = parseSecretList(listed.output);
  if (names === null) {
    console.log('\nCould not read the instance secret list — nothing was changed.');
    console.log('Set any missing secrets manually:');
    for (const secret of SECRETS) {
      console.log(
        `  npx wrangler secret put ${secret.name}   # ${secret.bytes} random bytes, base64`,
      );
    }
    return;
  }
  for (const secret of SECRETS) {
    if (names.has(secret.name)) {
      console.log(`${secret.name}: already present — leaving it unchanged.`);
      continue;
    }
    console.log(`${secret.name}: not set — setting it now.`);
    await runStep(`npx wrangler secret put ${secret.name}`, {
      cwd: productDir,
      input: `${secretValue(secret.bytes)}\n`,
    });
    console.log(`${secret.name}: set.`);
  }
}

async function stepDeployAndReport() {
  console.log('\n4/6 Applying remote migrations…');
  await runStep(`npx wrangler d1 migrations apply ${DATABASE_NAME} --remote`, { cwd: productDir });

  console.log('\n5/6 Deploying the product…');
  const deployOutput = await runStep('npm run deploy --workspace @jury-forge/product');

  console.log('\n6/6 Done.');
  const origin = parseOrigin(deployOutput);
  if (origin === null) {
    console.log('The instance origin could not be read from the deploy output.');
    console.log('Find it in the Cloudflare dashboard, then open https://<instance>/setup.');
    return;
  }
  console.log(`Instance origin: ${origin}`);
  console.log(`Wizard URL:      ${wizardUrl(origin)}`);
  console.log('\nNext steps:');
  console.log('  1. Open the wizard URL above.');
  console.log('  2. Paste the SETUP_CODE you set as a Worker secret.');
  console.log('  3. Install the GitHub App on the account that should be reviewed.');
  console.log('  4. Sign in with GitHub to claim the instance.');
}

export async function main() {
  const args = process.argv.slice(2);
  const known = new Set(['--dry-run', '--yes', '--help']);
  const unknown = args.filter((arg) => !known.has(arg));
  if (unknown.length > 0) {
    console.error(`Unknown option(s): ${unknown.join(', ')}`);
    usage();
    process.exit(2);
  }
  if (args.includes('--help')) {
    usage();
    return;
  }
  if (args.includes('--dry-run')) {
    printPlan();
    return;
  }

  const assumeYes = args.includes('--yes');
  if (!assumeYes) {
    if (!process.stdin.isTTY) {
      console.error('No interactive terminal detected. Re-run with --yes to confirm the changes.');
      process.exit(1);
    }
    if (!(await confirm())) {
      console.log('Aborted.');
      process.exit(1);
    }
  }

  await stepAuth();
  await stepDatabase();
  await stepSecrets();
  await stepDeployAndReport();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
