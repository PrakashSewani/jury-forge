import type { Finding } from '@jury-forge/shared';
import { z } from 'zod';

// D-009 inline caps, plus the per-reviewer stored cap from the design.
export const FINDING_CAPS = { stored: 50, inlinePerReviewer: 10, inlinePerRun: 25 };

const findingSchema = z.object({
  file: z.string().min(1),
  line: z.number().int().positive().optional().catch(undefined),
  severity: z.enum(['info', 'warning', 'error']).catch('info'),
  title: z
    .string()
    .min(1)
    .transform((value) => value.slice(0, 120)),
  body: z
    .string()
    .min(1)
    .transform((value) => value.slice(0, 2_000)),
});

/** Validates a provider's parsed output into findings; drops what cannot be repaired. */
export function parseFindings(raw: unknown): Finding[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (
    raw !== null &&
    typeof raw === 'object' &&
    Array.isArray((raw as { findings?: unknown }).findings)
  ) {
    list = (raw as { findings: unknown[] }).findings;
  }
  const findings: Finding[] = [];
  for (const item of list) {
    const parsed = findingSchema.safeParse(item);
    if (parsed.success) {
      findings.push(parsed.data);
    }
    if (findings.length >= FINDING_CAPS.stored) {
      break;
    }
  }
  return findings;
}

/** The right-side (new file) line numbers a patch makes commentable. */
export function newFileLines(patch: string): Set<number> {
  const lines = new Set<number>();
  let current: number | null = null;
  for (const line of patch.split('\n')) {
    if (line.startsWith('@@')) {
      const match = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      current = match ? Number(match[1]) : null;
      continue;
    }
    if (current === null) {
      continue;
    }
    if (line.startsWith('+') || line.startsWith(' ')) {
      lines.add(current);
      current += 1;
    } else if (line.startsWith('-') || line.startsWith('\\')) {
      // deletions and "\ No newline" markers do not advance the new file
    } else {
      current = null;
    }
  }
  return lines;
}

export interface ReviewerFindings {
  reviewerId: string;
  findings: Finding[];
}

export interface InlineCommentSelection {
  reviewerId: string;
  finding: Finding & { line: number };
}

export interface ConsolidationResult {
  inline: InlineCommentSelection[];
  overflow: ReviewerFindings[];
}

export function consolidateReview(
  reviewers: ReviewerFindings[],
  patches: Map<string, string>,
  caps: { perReviewer: number; perRun: number } = {
    perReviewer: FINDING_CAPS.inlinePerReviewer,
    perRun: FINDING_CAPS.inlinePerRun,
  },
): ConsolidationResult {
  const lineCache = new Map<string, Set<number>>();
  const linesOf = (file: string): Set<number> | null => {
    const patch = patches.get(file);
    if (patch === undefined) {
      return null;
    }
    let lines = lineCache.get(file);
    if (lines === undefined) {
      lines = newFileLines(patch);
      lineCache.set(file, lines);
    }
    return lines;
  };

  const inline: InlineCommentSelection[] = [];
  const overflow: ReviewerFindings[] = [];
  for (const reviewer of reviewers) {
    const overflowed: Finding[] = [];
    let inlined = 0;
    for (const finding of reviewer.findings) {
      const line = finding.line;
      const lines = linesOf(finding.file);
      const commentable = line !== undefined && lines !== null && lines.has(line);
      if (commentable && inlined < caps.perReviewer && inline.length < caps.perRun) {
        inline.push({ reviewerId: reviewer.reviewerId, finding: { ...finding, line } });
        inlined += 1;
      } else {
        overflowed.push(finding);
      }
    }
    if (overflowed.length > 0) {
      overflow.push({ reviewerId: reviewer.reviewerId, findings: overflowed });
    }
  }
  return { inline, overflow };
}
