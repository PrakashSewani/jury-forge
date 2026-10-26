import type {
  Finding,
  FindingSeverity,
  ProviderUsage,
  RunDetail,
  RunReviewerScope,
} from '@jury-forge/shared';
import { ReviewerSchema, RunDetailSchema, message } from '@jury-forge/shared';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { getRun, listReviewers } from '../lib/api';
import { formatBytes, formatTime, runStatusTone, severityTone, shortSha } from '../lib/format';
import { usePoll } from '../lib/use-poll';
import { useResource } from '../lib/use-resource';
import { Badge, Button, Card, EmptyState, ExternalLink, Notice, Row, Table, Tabs } from '../ui';
import type { TabItem } from '../ui';
import { reviewerFailureMessage } from './messages';
import { PageError, PageLoading } from './screen-state';

const DetailDataSchema = z.object({
  detail: RunDetailSchema,
  reviewers: z.array(ReviewerSchema),
});

type DetailData = z.infer<typeof DetailDataSchema>;

const SEVERITY_TABS: TabItem[] = [
  { id: 'all', label: 'All' },
  { id: 'error', label: 'Errors' },
  { id: 'warning', label: 'Warnings' },
  { id: 'info', label: 'Info' },
];

function findingLocation(finding: Finding): string {
  if (finding.line === undefined) {
    return finding.file;
  }
  if (finding.startLine !== undefined) {
    return `${finding.file}:${finding.startLine}-${finding.line}`;
  }
  return `${finding.file}:${finding.line}`;
}

/** One file's findings across every reviewer, most severe first, for the "By file" view. */
export interface FileGroup {
  file: string;
  findings: { reviewer: string; finding: Finding }[];
}

const SEVERITY_RANK: Record<FindingSeverity, number> = { error: 0, warning: 1, info: 2 };

export function groupByFile(
  outcomes: RunDetail['reviewers'],
  names: Map<string, string>,
  severity: 'all' | FindingSeverity,
): FileGroup[] {
  const groups = new Map<string, FileGroup>();
  for (const outcome of outcomes) {
    const reviewer = names.get(outcome.reviewerId) ?? outcome.reviewerId;
    for (const finding of outcome.findings ?? []) {
      if (severity !== 'all' && finding.severity !== severity) continue;
      const group = groups.get(finding.file) ?? { file: finding.file, findings: [] };
      group.findings.push({ reviewer, finding });
      groups.set(finding.file, group);
    }
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      findings: [...group.findings].sort(
        (a, b) => SEVERITY_RANK[a.finding.severity] - SEVERITY_RANK[b.finding.severity],
      ),
    }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

/** The finding as plain text, so a pasted finding carries its location and severity out of the app. */
export function findingAsText(finding: Finding): string {
  return `[${finding.severity}] ${finding.title} (${findingLocation(finding)})\n\n${finding.body}`;
}

/** Copy a finding to the clipboard and say so; a denied clipboard is reported, never silent. */
async function copyFinding(finding: Finding): Promise<void> {
  try {
    await navigator.clipboard.writeText(findingAsText(finding));
    toast.success('Finding copied');
  } catch {
    toast.error('Could not copy — select the text and copy it instead.');
  }
}

function formatTokens(value: number | null): string {
  return value === null ? '—' : value.toLocaleString();
}

/** D-032: the patterns that dropped a reviewer, as one clause. */
function filtersText(scope: { pathsInclude: string[]; pathsExclude: string[] }): string {
  const parts: string[] = [];
  if (scope.pathsInclude.length > 0) {
    parts.push(`include ${scope.pathsInclude.join(', ')}`);
  }
  if (scope.pathsExclude.length > 0) {
    parts.push(`exclude ${scope.pathsExclude.join(', ')}`);
  }
  return parts.length > 0 ? parts.join('; ') : 'its path filters';
}

function scopeText(scope: RunReviewerScope): string {
  const parts = [`${scope.visibleFiles} changed file(s) in scope`];
  if (scope.pathsInclude.length > 0) {
    parts.push(`include ${scope.pathsInclude.join(', ')}`);
  }
  if (scope.pathsExclude.length > 0) {
    parts.push(`exclude ${scope.pathsExclude.join(', ')}`);
  }
  if (scope.referenceFiles.length > 0) {
    parts.push(`reference ${scope.referenceFiles.length} file(s)`);
  }
  return parts.join(' · ');
}

function totalUsage(outcomes: RunDetail['reviewers']): ProviderUsage | null {
  let any = false;
  const totals: ProviderUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  for (const outcome of outcomes) {
    if (outcome.usage === null) continue;
    any = true;
    totals.promptTokens = (totals.promptTokens ?? 0) + (outcome.usage.promptTokens ?? 0);
    totals.completionTokens =
      (totals.completionTokens ?? 0) + (outcome.usage.completionTokens ?? 0);
    totals.totalTokens = (totals.totalTokens ?? 0) + (outcome.usage.totalTokens ?? 0);
  }
  return any ? totals : null;
}

export default function RunDetailPage({ id }: { id: string }) {
  const load = useCallback(
    async (signal: AbortSignal): Promise<DetailData> => {
      const [detail, reviewers] = await Promise.all([getRun(id, signal), listReviewers(signal)]);
      return { detail, reviewers };
    },
    [id],
  );
  const { data, failed, reload } = useResource(DetailDataSchema, load);
  const [severity, setSeverity] = useState<'all' | FindingSeverity>('all');
  const [grouping, setGrouping] = useState<'reviewer' | 'file'>('reviewer');
  const names = useMemo(
    () => new Map((data?.reviewers ?? []).map((reviewer) => [reviewer.id, reviewer.name])),
    [data],
  );

  usePoll(reload, { intervalMs: 5000, active: data?.detail.run.status === 'running' });

  const usage = useMemo(() => totalUsage(data?.detail.reviewers ?? []), [data]);

  if (failed) {
    return (
      <PageError
        message="This run could not be loaded. It may have been deleted, or the API did not answer."
        onRetry={reload}
      />
    );
  }
  if (data === null) {
    return <PageLoading />;
  }

  const { detail } = data;
  const { run } = detail;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">
            Run {shortSha(run.headSha)} · PR #{run.prNumber}
          </h1>
          <Badge tone={runStatusTone(run.status)}>{run.status}</Badge>
          {run.reviewUrl ? (
            <ExternalLink
              className="inline-flex items-center text-sm text-text-muted underline underline-offset-4 hover:text-text"
              href={run.reviewUrl}
            >
              View on GitHub
            </ExternalLink>
          ) : null}
        </div>
        <p className="text-xs text-text-muted">
          repo {run.repoId} · {run.event} · {detail.changedFiles} changed file(s) · started{' '}
          {formatTime(run.createdAt)} · finished {formatTime(run.finishedAt)}
        </p>
      </header>

      {run.error ? (
        <Notice tone="error">
          {message(run.error, 'The run did not finish. Check the Worker and run again.')}
        </Notice>
      ) : null}

      {run.mode === 'manual' ? (
        <Notice tone="info">Not posted to GitHub — this was a manual trial run.</Notice>
      ) : null}

      {usage ? (
        <Card title="Token usage">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-text-muted">Prompt</dt>
              <dd className="text-lg font-semibold">{formatTokens(usage.promptTokens)}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Completion</dt>
              <dd className="text-lg font-semibold">{formatTokens(usage.completionTokens)}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Total</dt>
              <dd className="text-lg font-semibold">{formatTokens(usage.totalTokens)}</dd>
            </div>
          </dl>
        </Card>
      ) : null}

      <KnowledgeCard detail={detail} names={names} />

      {detail.skippedReviewers.length > 0 ? (
        <Card title="Not run">
          <ul className="space-y-1 text-sm text-text-body">
            {detail.skippedReviewers.map((reviewer) => (
              <li key={reviewer.reviewerId}>
                <span className="font-medium">
                  {names.get(reviewer.reviewerId) ?? reviewer.name}
                </span>{' '}
                — no changed file matched {filtersText(reviewer)}.
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {detail.reviewers.length === 0 ? (
        <EmptyState
          description="This run recorded no per-reviewer results — it may have been skipped before any reviewer ran."
          title="No reviewer outcomes"
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs
              items={SEVERITY_TABS}
              onChange={(value) => setSeverity(value as 'all' | FindingSeverity)}
              value={severity}
            />
            <div className="flex items-center gap-1" role="group" aria-label="Group findings">
              <Button
                aria-pressed={grouping === 'reviewer'}
                onClick={() => setGrouping('reviewer')}
                size="sm"
                variant={grouping === 'reviewer' ? 'secondary' : 'ghost'}
              >
                By reviewer
              </Button>
              <Button
                aria-pressed={grouping === 'file'}
                onClick={() => setGrouping('file')}
                size="sm"
                variant={grouping === 'file' ? 'secondary' : 'ghost'}
              >
                By file
              </Button>
            </div>
          </div>
          {grouping === 'file' ? (
            <FileView groups={groupByFile(detail.reviewers, names, severity)} />
          ) : (
            <div className="space-y-4">
              {detail.reviewers.map((outcome) => {
                const findings = (outcome.findings ?? []).filter(
                  (finding) => severity === 'all' || finding.severity === severity,
                );
                return (
                  <Card
                    key={outcome.reviewerId}
                    title={names.get(outcome.reviewerId) ?? outcome.reviewerId}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        tone={
                          outcome.status === 'completed'
                            ? 'green'
                            : outcome.status === 'failed'
                              ? 'red'
                              : 'amber'
                        }
                      >
                        {outcome.status}
                      </Badge>
                      <span className="text-xs text-text-muted">{findings.length} finding(s)</span>
                    </div>
                    {outcome.scope ? (
                      <p className="text-xs text-text-muted">{scopeText(outcome.scope)}</p>
                    ) : null}
                    {outcome.status === 'failed' ? (
                      <Notice tone="error">{reviewerFailureMessage(outcome.error)}</Notice>
                    ) : outcome.status === 'pending' ? (
                      <p className="text-sm text-text-muted">
                        This reviewer has not finished yet — its findings will appear when the run
                        completes.
                      </p>
                    ) : null}
                    {outcome.summary ? (
                      <p className="whitespace-pre-wrap text-sm text-text-body">
                        {outcome.summary}
                      </p>
                    ) : null}
                    {outcome.usage ? (
                      <p className="text-xs text-text-muted">
                        usage: {formatTokens(outcome.usage.promptTokens)} prompt /{' '}
                        {formatTokens(outcome.usage.completionTokens)} completion /{' '}
                        {formatTokens(outcome.usage.totalTokens)} total tokens
                      </p>
                    ) : null}
                    {findings.length > 0 ? (
                      <Table className="w-full text-left">
                        <tbody>
                          {findings.map((finding, index) => (
                            <Row
                              className="border-b border-border align-top last:border-0"
                              key={`${finding.file}-${finding.line ?? 'x'}-${index}`}
                            >
                              <td className="w-24 py-3 pr-3">
                                <Badge tone={severityTone(finding.severity)}>
                                  {finding.severity}
                                </Badge>
                              </td>
                              <td className="space-y-1 py-3">
                                <div className="flex flex-wrap items-center gap-2 text-sm">
                                  <span className="font-medium">{finding.title}</span>
                                  <code className="font-mono text-xs text-text-muted">
                                    {findingLocation(finding)}
                                  </code>
                                  <Button
                                    onClick={() => void copyFinding(finding)}
                                    size="sm"
                                    variant="ghost"
                                  >
                                    Copy
                                  </Button>
                                </div>
                                <p className="whitespace-pre-wrap text-sm text-text-body">
                                  {finding.body}
                                </p>
                              </td>
                            </Row>
                          ))}
                        </tbody>
                      </Table>
                    ) : outcome.status === 'completed' ? (
                      <p className="text-sm text-text-muted">
                        No findings{severity === 'all' ? '.' : ' at this severity.'}
                      </p>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** D-034: the run's immutable knowledge record — nothing here reaches the posted review. */
function KnowledgeCard({ detail, names }: { detail: RunDetail; names: Map<string, string> }) {
  const outcomes = detail.reviewers.filter((outcome) => outcome.knowledge !== null);
  if (detail.knowledge.packs.length === 0 && outcomes.length === 0) {
    return null;
  }
  return (
    <Card title="Knowledge">
      <p className="text-sm text-text-muted">
        {detail.knowledge.packs.length === 0
          ? 'No knowledge packs were applied to this run.'
          : `${detail.knowledge.packs.length} pack(s) applied · ${formatBytes(detail.knowledge.totalBytes)} recorded across the run.`}
      </p>
      {outcomes.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {outcomes.map((outcome) => {
            const knowledge = outcome.knowledge;
            if (knowledge === null) {
              return null;
            }
            return (
              <li className="rounded-control border border-border p-3" key={outcome.reviewerId}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {names.get(outcome.reviewerId) ?? outcome.reviewerId}
                  </span>
                  <span className="text-xs text-text-muted">
                    {knowledge.applied.length} applied · {formatBytes(knowledge.totalBytes)} of{' '}
                    {formatBytes(knowledge.budgetBytes)}
                  </span>
                  {knowledge.overBudget ? <Badge tone="amber">manifest over budget</Badge> : null}
                </div>
                {knowledge.applied.length > 0 ? (
                  <ul className="mt-2 space-y-2">
                    {knowledge.applied.map((pack) => (
                      <li key={`${pack.slug}@${pack.hash}`}>
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-mono text-xs">
                            {pack.slug}@{shortSha(pack.hash)}
                          </span>
                          <Badge tone="neutral">{pack.scope}</Badge>
                          <span className="text-xs text-text-muted">
                            {formatBytes(pack.bytes)} · manifest {formatBytes(pack.manifestBytes)} +
                            docs {formatBytes(pack.docBytes)}
                          </span>
                        </div>
                        <details className="mt-1">
                          <summary className="flex min-h-11 cursor-pointer items-center text-xs text-text-muted">
                            {pack.includedFiles.length} included · {pack.droppedFiles.length}{' '}
                            dropped · {pack.withheldFiles.length} withheld
                          </summary>
                          {pack.includedFiles.length > 0 ? (
                            <p className="text-xs text-text-muted">
                              Included: {pack.includedFiles.join(', ')}
                            </p>
                          ) : null}
                          {pack.droppedFiles.length > 0 ? (
                            <p className="text-xs text-text-muted">
                              Dropped:{' '}
                              {pack.droppedFiles
                                .map((file) => `${file.path} (${file.reason})`)
                                .join(', ')}
                            </p>
                          ) : null}
                          {pack.withheldFiles.length > 0 ? (
                            <p className="text-xs text-text-muted">
                              Withheld by never_quote: {pack.withheldFiles.join(', ')}
                            </p>
                          ) : null}
                        </details>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-text-muted">No packs were applied.</p>
                )}
                {knowledge.notApplied.length > 0 ? (
                  <p className="mt-2 text-xs text-text-muted">
                    Not applied:{' '}
                    {knowledge.notApplied
                      .map(
                        (pack) =>
                          `${pack.slug}@${shortSha(pack.hash)} (${
                            pack.reason === 'paths' ? 'paths did not match' : 'pack limit'
                          })`,
                      )
                      .join(', ')}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </Card>
  );
}

function FileView({ groups }: { groups: FileGroup[] }) {
  if (groups.length === 0) {
    return (
      <EmptyState
        description="No reviewer reported a finding at this severity for this run."
        title="No findings to group"
      />
    );
  }
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <Card key={group.file} title={group.file}>
          <Table className="w-full text-left">
            <tbody>
              {group.findings.map(({ reviewer, finding }, index) => (
                <Row
                  className="border-b border-border align-top last:border-0"
                  key={`${reviewer}-${finding.line ?? 'x'}-${index}`}
                >
                  <td className="w-24 py-3 pr-3">
                    <Badge tone={severityTone(finding.severity)}>{finding.severity}</Badge>
                  </td>
                  <td className="space-y-1 py-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{finding.title}</span>
                      <span className="text-xs text-text-muted">{reviewer}</span>
                      <code className="font-mono text-xs text-text-muted">
                        {findingLocation(finding)}
                      </code>
                      <Button onClick={() => void copyFinding(finding)} size="sm" variant="ghost">
                        Copy
                      </Button>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-text-body">{finding.body}</p>
                  </td>
                </Row>
              ))}
            </tbody>
          </Table>
        </Card>
      ))}
    </div>
  );
}
