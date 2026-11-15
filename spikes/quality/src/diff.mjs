// THROWAWAY SPIKE CODE - not part of the Jury Forge product.
// Minimal unified-diff parser. Known limits: paths containing quotes/escapes are not unescaped;
// combined (merge) diffs are not supported. Cases that break these limits must be excluded at
// dataset selection, not silently truncated.

const stripPrefix = (p) => p.replace(/\t.*$/, '').replace(/^"|"$/g, '').replace(/^[ab]\//, '');

export function parseDiff(patch) {
  const files = [];
  let cur = null;
  let hunk = null;
  let newLine = 0;
  for (const raw of patch.replace(/\r\n/g, '\n').split('\n')) {
    if (raw.startsWith('diff --git ')) {
      cur = { path: null, status: 'modified', binary: false, lines: new Map(), hunks: [] };
      const m = /^diff --git a\/(.+?) b\/(.+)$/.exec(raw);
      if (m) cur.path = m[2];
      files.push(cur);
      hunk = null;
      continue;
    }
    if (!cur) continue;
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (h) {
      hunk = { header: raw, rows: [] };
      newLine = Number(h[2]);
      cur.hunks.push(hunk);
      continue;
    }
    if (hunk === null) {
      if (raw.startsWith('+++ ')) {
        const p = raw.slice(4);
        if (p.startsWith('/dev/null')) cur.status = 'deleted';
        else cur.path = stripPrefix(p);
      } else if (raw.startsWith('new file mode')) cur.status = 'added';
      else if (raw.startsWith('deleted file mode')) cur.status = 'deleted';
      else if (raw.startsWith('rename to ')) cur.path = raw.slice('rename to '.length);
      else if (raw.startsWith('Binary files') || raw.startsWith('GIT binary patch')) cur.binary = true;
      continue;
    }
    if (raw.startsWith('+')) {
      const text = raw.slice(1);
      cur.lines.set(newLine, { type: 'add', text });
      hunk.rows.push({ kind: 'add', n: newLine, text });
      newLine++;
    } else if (raw.startsWith('-')) {
      hunk.rows.push({ kind: 'del', text: raw.slice(1) });
    } else if (raw.startsWith(' ')) {
      const text = raw.slice(1);
      cur.lines.set(newLine, { type: 'ctx', text });
      hunk.rows.push({ kind: 'ctx', n: newLine, text });
      newLine++;
    }
    // '\ No newline at end of file' and the split artefact '' are ignored.
  }
  return files.filter((f) => f.path || f.status === 'deleted');
}

/** The only diff view any condition sees: new-side line numbers in the left column. */
export function renderAnnotated(files) {
  const out = [];
  for (const f of files) {
    if (f.binary) {
      out.push(`=== FILE: ${f.path} (binary; content not shown) ===`, '');
      continue;
    }
    out.push(`=== FILE: ${f.path} (${f.status}) ===`);
    for (const hk of f.hunks) {
      out.push(hk.header);
      for (const r of hk.rows) {
        if (r.kind === 'del') out.push(`    - | -${r.text}`);
        else out.push(`${String(r.n).padStart(5)} | ${r.kind === 'add' ? '+' : ' '}${r.text}`);
      }
    }
    out.push('');
  }
  return out.join('\n');
}
