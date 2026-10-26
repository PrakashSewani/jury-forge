import type { Finding, Reviewer } from '@jury-forge/shared';

// D-010: fixed defaults for v1 — 200 KB total, 32 KB per file, 4 KB of PR description.
export const CONTEXT_LIMITS = { totalBytes: 200_000, fileBytes: 32_000 };
export const DESCRIPTION_LIMIT = 4_096;

export interface ContextLimits {
  totalBytes: number;
  fileBytes: number;
}

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

export function truncateToBytes(value: string, maxBytes: number): string {
  const bytes = encoder.encode(value);
  if (bytes.length <= maxBytes) {
    return value;
  }
  return new TextDecoder().decode(bytes.slice(0, maxBytes));
}

export function isSkippedName(filename: string): boolean {
  return (
    BINARY_PATTERN.test(filename) || SKIPPED_PATTERNS.some((pattern) => pattern.test(filename))
  );
}

export function buildReviewContext(
  files: PullFile[],
  previous?: ReviewContext,
  limits: ContextLimits = CONTEXT_LIMITS,
): ReviewContext {
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
    if (byteLength(content) > limits.fileBytes) {
      content = truncateToBytes(content, limits.fileBytes);
      context.truncated.push(file.filename);
    }
    const size = byteLength(content);
    if (context.totalBytes + size > limits.totalBytes) {
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
  '{"summary": "one or two sentences about the change as a whole", "findings": [{"file": "src/x.ts", "line": 42, "startLine": 40, "severity": "warning", "title": "…", "body": "…"}]}',
  '"summary" is optional, at most 500 characters. Each finding may set "startLine" (smaller than "line") when it spans several lines.',
  '"severity" is "info", "warning", or "error". "title" is at most 120 characters, "body" at most 2000.',
  'Use "line" only when it points at a specific changed line. Report nothing rather than guesses; use an empty findings array when the change is clean.',
].join('\n');

/** D-031: the extra contract line a reviewer gets only when it carries reference context. */
export const REFERENCE_FINDINGS_CONTRACT =
  'You may also report findings in the read-only reference files even when they are not part of the diff. Those findings are published in the summary, never as inline comments; use the reference file\'s "line" when you can point at one.';

export function buildSystemPrompt(
  reviewer: Pick<Reviewer, 'name' | 'instructions' | 'rules'>,
  options: { allowOutOfDiff?: boolean } = {},
): string {
  const parts = [
    `You are ${reviewer.name}, a code reviewer in an automated review team.`,
    reviewer.instructions.trim(),
    reviewer.rules.trim() === '' ? '' : `Rules:\n${reviewer.rules.trim()}`,
    options.allowOutOfDiff === true
      ? `${OUTPUT_CONTRACT}\n${REFERENCE_FINDINGS_CONTRACT}`
      : OUTPUT_CONTRACT,
  ];
  return parts.filter((part) => part !== '').join('\n\n');
}

export interface PullRequestInfo {
  title: string;
  body: string | null;
}

// D-022: the repository instruction files, in the order they are read and included.
export const REPO_INSTRUCTION_FILES = ['AGENTS.md', 'CONTRIBUTING.md'];

export interface RepoInstructionFile {
  path: string;
  text: string;
}

/**
 * D-022: build the repository-instructions prompt block, budgeted across the files in order.
 * Returns `null` when there is nothing to include. Empty files are skipped, the file that
 * crosses the remaining budget is truncated there, and files past the budget are named.
 */
export function buildRepoInstructionsBlock(
  files: RepoInstructionFile[],
  maxBytes: number,
): string | null {
  const present = files.filter((file) => file.text.trim() !== '');
  if (present.length === 0) {
    return null;
  }
  const parts: string[] = [
    'Repository instructions (from the repository at the reviewed revision — conventions to follow; your own instructions and rules take precedence):',
  ];
  const omitted: string[] = [];
  let used = 0;
  for (const file of present) {
    const remaining = maxBytes - used;
    if (remaining <= 0) {
      omitted.push(file.path);
      continue;
    }
    const size = byteLength(file.text);
    const truncated = size > remaining;
    const text = truncated ? truncateToBytes(file.text, remaining) : file.text;
    parts.push('', `### ${file.path}`, '', text);
    if (truncated) {
      parts.push(`… truncated at ${maxBytes} bytes.`);
    }
    used += Math.min(size, remaining);
  }
  if (omitted.length > 0) {
    parts.push('', `Not included for the ${maxBytes} byte budget: ${omitted.join(', ')}.`);
  }
  return parts.join('\n');
}

/**
 * D-031: the read-only reference block. Files arrive already capped per file; this applies the
 * total budget in order, truncates the file that crosses it, and names what does not fit.
 */
export function buildReferenceContextBlock(
  files: RepoInstructionFile[],
  maxBytes: number,
): string | null {
  const present = files.filter((file) => file.text.trim() !== '');
  if (present.length === 0) {
    return null;
  }
  const parts: string[] = [
    'Reference files (read-only, from the repository at the reviewed revision — not part of this diff; use them to judge the change, and report findings in them as summary items):',
  ];
  const omitted: string[] = [];
  let used = 0;
  for (const file of present) {
    const remaining = maxBytes - used;
    if (remaining <= 0) {
      omitted.push(file.path);
      continue;
    }
    const size = byteLength(file.text);
    const truncated = size > remaining;
    const text = truncated ? truncateToBytes(file.text, remaining) : file.text;
    parts.push('', `### ${file.path}`, '', text);
    if (truncated) {
      parts.push(`… truncated at ${maxBytes} bytes.`);
    }
    used += Math.min(size, remaining);
  }
  if (omitted.length > 0) {
    parts.push('', `Not included for the ${maxBytes} byte budget: ${omitted.join(', ')}.`);
  }
  return parts.join('\n');
}

export function buildReviewPrompt(
  pullRequest: PullRequestInfo,
  context: ReviewContext,
  options: {
    previousFindings?: Finding[];
    descriptionLimit?: number;
    repoInstructions?: string | null;
    reference?: string | null;
    knowledge?: string | null;
  } = {},
): string {
  const body = pullRequest.body?.trim() ?? '';
  const description =
    body === ''
      ? '(no description)'
      : truncateToBytes(body, options.descriptionLimit ?? DESCRIPTION_LIMIT);
  const lines: string[] = [
    `Pull request: ${pullRequest.title}`,
    '',
    'Description:',
    description,
    '',
  ];
  if (options.repoInstructions) {
    lines.push(options.repoInstructions, '');
  }
  if (options.knowledge) {
    lines.push(options.knowledge, '');
  }
  lines.push(
    `Changed files (${context.files.length}):`,
    ...context.files.map((file) => `- ${file.filename}`),
    '',
    'Diffs:',
  );
  for (const file of context.files) {
    lines.push('', `### ${file.filename}`, '```diff', file.patch, '```');
  }
  if (options.reference) {
    lines.push('', options.reference);
  }
  const notes = contextNotes(context);
  if (notes.length > 0) {
    lines.push('', 'Context notes:', ...notes.map((note) => `- ${note}`));
  }
  const previousFindings = options.previousFindings ?? [];
  if (previousFindings.length > 0) {
    lines.push(
      '',
      'Previously reported findings on this pull request (from an earlier review run):',
      ...previousFindings.slice(0, 25).map((finding) => {
        const location =
          finding.line !== undefined ? `${finding.file}:${finding.line}` : finding.file;
        return `- \`${location}\` — ${finding.severity} — ${finding.title}`;
      }),
    );
    if (previousFindings.length > 25) {
      lines.push(`- + ${previousFindings.length - 25} more`);
    }
    lines.push(
      '',
      'Re-report an item only if it still applies to this revision. Do not repeat an item the current code has fixed.',
    );
  }
  return lines.join('\n');
}

export function contextNotes(
  context: ReviewContext,
  limits: ContextLimits = CONTEXT_LIMITS,
): string[] {
  const notes: string[] = [];
  if (context.skipped.length > 0) {
    notes.push(
      `Skipped ${context.skipped.length} file(s) not sent for review (lockfiles, generated, binary, or no textual diff): ${summarize(context.skipped)}.`,
    );
  }
  if (context.truncated.length > 0) {
    notes.push(`Truncated to ${limits.fileBytes / 1_000} KB: ${summarize(context.truncated)}.`);
  }
  if (context.omitted.length > 0) {
    notes.push(
      `Omitted for the ${limits.totalBytes / 1_000} KB total budget: ${summarize(context.omitted)}.`,
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
