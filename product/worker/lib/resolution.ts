import type { Finding } from '@jury-forge/shared';

export interface ResolutionBuckets {
  resolved: Finding[];
  stillPresent: Finding[];
  new: Finding[];
}

/** D-020: a deterministic key — file, line (or file-level), and case-folded title. */
export function findingKey(finding: Finding): string {
  return `${finding.file}::${finding.line ?? ''}::${finding.title.trim().toLowerCase()}`;
}

function byKey(findings: Finding[]): Map<string, Finding> {
  const map = new Map<string, Finding>();
  for (const finding of findings) {
    const key = findingKey(finding);
    if (!map.has(key)) {
      map.set(key, finding);
    }
  }
  return map;
}

/**
 * Compares the previous run's findings with this run's, de-duplicating each side by
 * `findingKey` (first occurrence wins, input order kept). Pure — no I/O.
 */
export function compareFindings(previous: Finding[], current: Finding[]): ResolutionBuckets {
  const previousByKey = byKey(previous);
  const currentByKey = byKey(current);
  const resolved: Finding[] = [];
  for (const [key, finding] of previousByKey) {
    if (!currentByKey.has(key)) {
      resolved.push(finding);
    }
  }
  const stillPresent: Finding[] = [];
  const added: Finding[] = [];
  for (const [key, finding] of currentByKey) {
    if (previousByKey.has(key)) {
      stillPresent.push(finding);
    } else {
      added.push(finding);
    }
  }
  return { resolved, stillPresent, new: added };
}
