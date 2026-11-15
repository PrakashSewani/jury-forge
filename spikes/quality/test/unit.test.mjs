// THROWAWAY SPIKE CODE - not part of the Jury Forge product.
// Offline unit checks for the harness plumbing. No network, no model calls, no secrets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDiff, renderAnnotated } from '../src/diff.mjs';
import { parseModelText, validateResponse } from '../src/schema.mjs';
import { redact, jaccard, normPath } from '../src/util.mjs';

const CFG = { severities: ['critical', 'high', 'medium', 'low'] };

const PATCH = [
  'diff --git a/src/db.ts b/src/db.ts',
  'index 1111111..2222222 100644',
  '--- a/src/db.ts',
  '+++ b/src/db.ts',
  '@@ -1,3 +1,4 @@',
  ' const a = 1;',
  '-const q = "SELECT 1";',
  '+const q = "SELECT " + id;',
  '+run(q);',
  ' export {};',
  ''
].join('\n');

test('parseDiff maps new-side line numbers to added and context lines', () => {
  const [f] = parseDiff(PATCH);
  assert.equal(f.path, 'src/db.ts');
  assert.equal(f.status, 'modified');
  assert.equal(f.lines.get(2).text, 'const q = "SELECT " + id;');
  assert.equal(f.lines.get(2).type, 'add');
  assert.equal(f.lines.get(3).type, 'add');
  assert.equal(f.lines.get(4).type, 'ctx');
  assert.equal(f.lines.has(5), false);
});

test('renderAnnotated shows new-side numbers and marks deletions without a number', () => {
  const text = renderAnnotated(parseDiff(PATCH));
  assert.match(text, /=== FILE: src\/db\.ts \(modified\) ===/);
  assert.match(text, /^ {4}2 \| \+const q = "SELECT " \+ id;$/m);
  assert.match(text, /^ {4}- \| -const q = "SELECT 1";$/m);
});

test('parseDiff marks binary files and does not invent line content', () => {
  const bin = 'diff --git a/logo.png b/logo.png\nBinary files a/logo.png and b/logo.png differ\n';
  const [f] = parseDiff(bin);
  assert.equal(f.binary, true);
  assert.equal(f.lines.size, 0);
});

test('parseModelText rejects prose around JSON and accepts one outer fence', () => {
  assert.equal(parseModelText('Here you go: {"findings": []}').ok, false);
  assert.equal(parseModelText('```json\n{"findings": []}\n```').ok, true);
  assert.equal(parseModelText('{"findings": []}').ok, true);
});

test('validateResponse drops invalid findings and counts them; keeps valid ones', () => {
  const r = validateResponse(
    {
      findings: [
        { file: './src/db.ts', line: 2, severity: 'high', category: 'sql-injection', claim: 'x', evidence: 'y', confidence: 0.9 },
        { file: 'src/db.ts', line: 0, severity: 'high', category: 'c', claim: 'x', evidence: 'y', confidence: 0.9 },
        { file: 'src/db.ts', line: 2, severity: 'urgent', category: 'c', claim: 'x', evidence: 'y', confidence: 0.9 }
      ]
    },
    CFG
  );
  assert.equal(r.ok, true);
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].file, 'src/db.ts');
  assert.deepEqual(
    r.invalid.map((i) => i.errors),
    [['line'], ['severity']]
  );
});

test('chair output requires sources and a dissent array', () => {
  const finding = { file: 'a.ts', line: 1, severity: 'low', category: 'c', claim: 'x', evidence: 'y', confidence: 0.5 };
  assert.equal(validateResponse({ findings: [finding], dissent: [] }, CFG, { chair: true }).invalid.length, 1);
  const ok = validateResponse({ findings: [{ ...finding, sources: ['security-1'] }], dissent: [] }, CFG, { chair: true });
  assert.equal(ok.findings.length, 1);
  assert.equal(validateResponse({ findings: [] }, CFG, { chair: true }).ok, false);
});

test('redact removes known secret values and ignores short strings', () => {
  assert.equal(redact('key=PLACEHOLDER-VALUE-123 end', ['PLACEHOLDER-VALUE-123']), 'key=[REDACTED] end');
  assert.equal(redact('ab', ['ab']), 'ab');
});

test('jaccard and normPath behave as the dedupe and grounding rules assume', () => {
  assert.equal(jaccard('sql injection in query', 'sql injection in query'), 1);
  assert.equal(normPath('.\\src\\a.ts'), 'src/a.ts');
});
