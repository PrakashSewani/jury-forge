// Licence allowlist check (C1, WP 1-04). Run with `pnpm licences`.
//
// Reads `pnpm licenses list --json` for every installed package (dev included) and for the
// production set, then fails if any package's SPDX expression is not satisfiable from the
// allowlist in licence-policy.json. Exceptions name a package, a licence, and a reason; a
// `dev`-scoped exception is void if that package is reachable from production dependencies.
//
// Usage: node scripts/check-licences.ts [--input all.json [--prod-input prod.json]]

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export interface LicenceException {
  name: string;
  licence: string;
  scope: 'dev' | 'all';
  reason: string;
}

export interface LicencePolicy {
  allowed: string[];
  exceptions: LicenceException[];
}

export interface PackageLicence {
  name: string;
  version: string;
  licence: string;
}

export interface Violation extends PackageLicence {
  problem: string;
}

/** `pnpm licenses list --json` groups packages by licence string. */
export type PnpmLicenceReport = Record<string, Array<{ name: string; versions: string[] }>>;

export function flattenReport(report: PnpmLicenceReport): PackageLicence[] {
  return Object.entries(report).flatMap(([licence, packages]) =>
    packages.flatMap((pkg) =>
      pkg.versions.map((version) => ({ name: pkg.name, version, licence })),
    ),
  );
}

type Token = '(' | ')' | 'AND' | 'OR' | 'WITH' | { id: string };

function tokenize(expression: string): Token[] {
  const parts = expression.replace(/[()]/g, ' $& ').trim().split(/\s+/);
  return parts.map((part): Token => {
    if (part === '(' || part === ')') return part;
    const upper = part.toUpperCase();
    if (upper === 'AND' || upper === 'OR' || upper === 'WITH') return upper;
    return { id: part };
  });
}

/**
 * True when the SPDX expression can be satisfied using only allowed licences: one side of every
 * OR, and both sides of every AND. `X WITH exception` counts as its own identifier, so it must be
 * listed exactly. Anything unparseable (UNKNOWN, "SEE LICENSE IN …", stray operators) is false.
 */
export function satisfiable(expression: string, allowed: ReadonlySet<string>): boolean {
  if (expression.trim() === '') return false;
  const tokens = tokenize(expression);
  let index = 0;

  const fail = (): never => {
    throw new SyntaxError(`Unparseable SPDX expression: ${expression}`);
  };

  const atom = (): boolean => {
    const token = tokens[index++];
    if (token === '(') {
      const value = orExpr();
      if (tokens[index++] !== ')') fail();
      return value;
    }
    if (token === undefined || typeof token === 'string') return fail();
    let id = token.id;
    if (tokens[index] === 'WITH') {
      index++;
      const exception = tokens[index++];
      if (exception === undefined || typeof exception === 'string') return fail();
      id = `${id} WITH ${exception.id}`;
    }
    return allowed.has(id);
  };

  const andExpr = (): boolean => {
    let value = atom();
    while (tokens[index] === 'AND') {
      index++;
      const right = atom();
      value = value && right;
    }
    return value;
  };

  function orExpr(): boolean {
    let value = andExpr();
    while (tokens[index] === 'OR') {
      index++;
      const right = andExpr();
      value = value || right;
    }
    return value;
  }

  try {
    const value = orExpr();
    return index === tokens.length && value;
  } catch {
    return false;
  }
}

function matchesName(pattern: string, name: string): boolean {
  return pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : pattern === name;
}

export function evaluate(
  all: PackageLicence[],
  prodNames: ReadonlySet<string>,
  policy: LicencePolicy,
): Violation[] {
  const allowed = new Set(policy.allowed);
  const violations: Violation[] = [];
  for (const pkg of all) {
    if (satisfiable(pkg.licence, allowed)) continue;
    const exception = policy.exceptions.find(
      (e) => matchesName(e.name, pkg.name) && e.licence === pkg.licence,
    );
    if (exception === undefined) {
      violations.push({ ...pkg, problem: 'licence is not on the allowlist' });
    } else if (exception.scope === 'dev' && prodNames.has(pkg.name)) {
      violations.push({ ...pkg, problem: 'dev-only exception, but reachable from production' });
    }
  }
  return violations.sort((a, b) => a.name.localeCompare(b.name));
}

function pnpmReport(prod: boolean): PnpmLicenceReport {
  const args = ['licenses', 'list', '--json', ...(prod ? ['--prod'] : [])];
  // On Windows pnpm is a .cmd shim that only cmd.exe can start. The arguments are the fixed
  // constants above, never user input, so there is nothing to escape.
  const [command, commandArgs] =
    process.platform === 'win32'
      ? ['cmd.exe', ['/d', '/s', '/c', 'pnpm', ...args]]
      : ['pnpm', args];
  const output = execFileSync(command, commandArgs, { encoding: 'utf8' });
  // pnpm prints an empty string (not "{}") when there is nothing to report.
  return output.trim() === '' ? {} : (JSON.parse(output) as PnpmLicenceReport);
}

function readReport(path: string): PnpmLicenceReport {
  return JSON.parse(readFileSync(path, 'utf8')) as PnpmLicenceReport;
}

function argument(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
}

export function main(): number {
  const policy = JSON.parse(
    readFileSync(new URL('../licence-policy.json', import.meta.url), 'utf8'),
  ) as LicencePolicy;
  const input = argument('--input');
  const prodInput = argument('--prod-input');
  const all = flattenReport(input ? readReport(input) : pnpmReport(false));
  const prod = flattenReport(prodInput ? readReport(prodInput) : input ? {} : pnpmReport(true));
  const violations = evaluate(all, new Set(prod.map((p) => p.name)), policy);

  if (violations.length > 0) {
    console.error(`Licence check FAILED: ${violations.length} package(s).`);
    for (const v of violations) {
      console.error(`  ${v.name}@${v.version}  "${v.licence}"  ${v.problem}`);
    }
    return 1;
  }
  console.log(`Licence check passed: ${all.length} package versions (${prod.length} production).`);
  return 0;
}

if (import.meta.main) {
  process.exitCode = main();
}
