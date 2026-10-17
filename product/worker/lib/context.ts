import type { Reviewer } from '@jury-forge/shared';

// D-010: fixed defaults for v1 — 200 KB total, 32 KB per file, 4 KB of PR description.
export const CONTEXT_LIMITS = { totalBytes: 200_000, fileBytes: 32_000 };
export const DESCRIPTION_LIMIT = 4_096;

export interface PullFile {
  filename: string;
  patch?: string | null;
}

export interface ReviewContext {
  files: { filename: string; patch: string }[];
  totalBytes: number;
  skipped: string[];
  truncated: string[];
  omitted: string[];
}

const SKIPPED_PATTERNS: RegExp[] = [
  /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|composer\.lock|Gemfile\.lock|Cargo\.lock|poetry\.lock|Pipfile\.lock|go\.sum)$/,
  /\.(lock|lockb)$/,
  /\.min\.(js|css)$/,
  /\.map$/,
  /(^|\/)(dist|build|vendor|__snapshots__)\//,
  /\.generated\./,
];

const BINARY_PATTERN =
  /\.(png|jpe?g|gif|ico|webp|avif|bmp|tiff?|pdf|zip|tar|t?gz|bz2|xz|7z|rar|jar|war|class|exe|dll|dylib|so|wasm|bin|dat|db|sqlite|woff2?|ttf|otf|eot|mp[34]|m4[av]|mov|webm|wav|ogg|flac|psd|ai|sketch|fig)$/i;

const encoder = new TextEncoder();

function byteLength(value: string): number {
  return encoder.encode(value).length;
}

function truncateToBytes(value: string, maxBytes: number): string {
  const bytes = encoder.encode(value);
  if (bytes.length <= maxBytes) {
    return value;
  }
  return new TextDecoder().decode(bytes.slice(0, maxBytes));
}

function isSkippedName(filename: string): boolean {
  return (
    BINARY_PATTERN.test(filename) || SKIPPED_PATTERNS.some((pattern) => pattern.test(filename))
  );
}

export function buildReviewContext(files: PullFile[], previous?: ReviewContext): ReviewContext {
  const context: ReviewContext = previous
    ? {
        files: [...previous.files],
        totalBytes: previous.totalBytes,
        skipped: [...previous.skipped],
        truncated: [...previous.truncated],
        omitted: [...previous.omitted],
      }
    : {
        files: [],
        totalBytes: 0,
        skipped: [],
        truncated: [],
        omitted: [],
      };
  for (const file of files) {
    const patch = file.patch ?? null;
    if (patch === null || isSkippedName(file.filename)) {
      context.skipped.push(file.filename);
      continue;
    }
    let content = patch;
    if (byteLength(content) > CONTEXT_LIMITS.fileBytes) {
      content = truncateToBytes(content, CONTEXT_LIMITS.fileBytes);
      context.truncated.push(file.filename);
    }
    const size = byteLength(content);
    if (context.totalBytes + size > CONTEXT_LIMITS.totalBytes) {
      context.omitted.push(file.filename);
      continue;
    }
    context.files.push({ filename: file.filename, patch: content });
    context.totalBytes += size;
  }
  return context;
}

/**
 * D-018: order changed files so the D-010 budget truncates the least valuable diffs first —
 * added/changed source leads, docs and renames trail. Stable within a weight.
 */
export interface FilePriorityEntry {
  filename: string;
  status: string;
}

const STATUS_WEIGHT: Record<string, number> = { added: 0, modified: 1, changed: 1 };
const DEFAULT_STATUS_WEIGHT = 2;
const DOC_PATTERN =
  /(^|\/)(readme|license|notice|changelog|contributing|code_of_conduct)(\..*)?$|\.(md|mdx|txt|rst)$/i;

export function prioritizedOrder(entries: FilePriorityEntry[]): number[] {
  return entries
    .map((entry, index) => ({
      index,
      weight: STATUS_WEIGHT[entry.status] ?? DEFAULT_STATUS_WEIGHT,
      doc: DOC_PATTERN.test(entry.filename) ? 1 : 0,
    }))
    .sort((a, b) => a.weight - b.weight || a.doc - b.doc || a.index - b.index)
    .map((item) => item.index);
}

export const OUTPUT_CONTRACT = [
  'Respond with a single JSON object and nothing else:',
  '{"findings": [{"file": "src/x.ts", "line": 42, "severity": "warning", "title": "…", "body": "…"}]}',
  '"severity" is "info", "warning", or "error". "title" is at most 120 characters, "body" at most 2000.',
  'Use "line" only when it points at a specific changed line. Report nothing rather than guesses; use an empty findings array when the change is clean.',
].join('\n');

export function buildSystemPrompt(
  reviewer: Pick<Reviewer, 'name' | 'instructions' | 'rules'>,
): string {
  const parts = [
    `You are ${reviewer.name}, a code reviewer in an automated review team.`,
    reviewer.instructions.trim(),
    reviewer.rules.trim() === '' ? '' : `Rules:\n${reviewer.rules.trim()}`,
    OUTPUT_CONTRACT,
  ];
  return parts.filter((part) => part !== '').join('\n\n');
}

export interface PullRequestInfo {
  title: string;
  body: string | null;
}

export function buildReviewPrompt(pullRequest: PullRequestInfo, context: ReviewContext): string {
  const body = pullRequest.body?.trim() ?? '';
  const description = body === '' ? '(no description)' : truncateToBytes(body, DESCRIPTION_LIMIT);
  const lines: string[] = [
    `Pull request: ${pullRequest.title}`,
    '',
    'Description:',
    description,
    '',
    `Changed files (${context.files.length}):`,
    ...context.files.map((file) => `- ${file.filename}`),
    '',
    'Diffs:',
  ];
  for (const file of context.files) {
    lines.push('', `### ${file.filename}`, '```diff', file.patch, '```');
  }
  const notes = contextNotes(context);
  if (notes.length > 0) {
    lines.push('', 'Context notes:', ...notes.map((note) => `- ${note}`));
  }
  return lines.join('\n');
}

export function contextNotes(context: ReviewContext): string[] {
  const notes: string[] = [];
  if (context.skipped.length > 0) {
    notes.push(
      `Skipped ${context.skipped.length} file(s) not sent for review (lockfiles, generated, binary, or no textual diff): ${summarize(context.skipped)}.`,
    );
  }
  if (context.truncated.length > 0) {
    notes.push(
      `Truncated to ${CONTEXT_LIMITS.fileBytes / 1_000} KB: ${summarize(context.truncated)}.`,
    );
  }
  if (context.omitted.length > 0) {
    notes.push(
      `Omitted for the ${CONTEXT_LIMITS.totalBytes / 1_000} KB total budget: ${summarize(context.omitted)}.`,
    );
  }
  return notes;
}

function summarize(names: string[]): string {
  if (names.length <= 12) {
    return names.join(', ');
  }
  return `${names.slice(0, 12).join(', ')} … and ${names.length - 12} more`;
}
