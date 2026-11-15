// THROWAWAY SPIKE CODE - not part of the Jury Forge product.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/** Text files are read with LF endings so Windows autocrlf cannot change a hash. */
export const readText = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
export const sha256File = (path) => sha256(readText(path));

export const readJson = (path) => JSON.parse(readText(path));
export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}
export function writeText(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, 'utf8');
}
export const exists = existsSync;
export const listDir = (d) => (existsSync(d) ? readdirSync(d).sort() : []);

/** Replace every known secret value in a string. Used on anything that is logged or stored. */
export function redact(text, secrets) {
  let out = String(text);
  for (const s of secrets) if (s && s.length >= 8) out = out.split(s).join('[REDACTED]');
  return out;
}

export const normPath = (p) =>
  String(p ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^(\.\/)+/, '')
    .replace(/^\/+/, '');

export const tokens = (s) =>
  new Set(
    String(s)
      .toLowerCase()
      .split(/[^a-z0-9_]+/)
      .filter((t) => t.length > 2)
  );

export function jaccard(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export const ratio = (n, d) => (d === 0 ? null : n / d);
