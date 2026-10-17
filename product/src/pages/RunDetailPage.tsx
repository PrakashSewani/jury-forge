import type { Finding, FindingSeverity, ProviderUsage, RunDetail } from '@jury-forge/shared';
import { useCallback, useMemo, useState } from 'react';
import { getRun, listReviewers } from '../lib/api';
import { formatTime, runStatusTone, severityTone, shortSha } from '../lib/format';
import { useLoadable } from '../lib/use-loadable';
import { Badge, Card, cx, EmptyState, focusRing, Notice, Row, Table, Tabs, tapTarget } from '../ui';
import type { TabItem } from '../ui';
import { humanMessage, reviewerFailureMessage } from './messages';
import { PageError, PageLoading } from './screen-state';

interface DetailData {
  detail: RunDetail;
  names: Map<string, string>;
}

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

function formatTokens(value: number | null): string {
  return value === null ? '—' : value.toLocaleString();
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
  const load = useCallback(async (): Promise<DetailData> => {
    const [detail, reviewers] = await Promise.all([getRun(id), listReviewers()]);
    return { detail, names: new Map(reviewers.map((reviewer) => [reviewer.id, reviewer.name])) };
  }, [id]);
  const { data, failed, reload } = useLoadable(load);
  const [severity, setSeverity] = useState<'all' | FindingSeverity>('all');

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

  const { detail, names } = data;
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
            <a
              className={cx(
                'inline-flex items-center text-sm text-text-muted underline underline-offset-4 hover:text-text',
                tapTarget,
                focusRing,
              )}
              href={run.reviewUrl}
            >
              View on GitHub
            </a>
          ) : null}
        </div>
        <p className="text-xs text-text-muted">
          repo {run.repoId} · {run.event} · started {formatTime(run.createdAt)} · finished{' '}
          {formatTime(run.finishedAt)}
        </p>
      </header>

      {run.error ? (
        <Notice tone="error">
          {humanMessage(run.error, 'The run did not finish. Check the Worker and run again.')}
        </Notice>
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

      {detail.reviewers.length === 0 ? (
        <EmptyState
          description="This run recorded no per-reviewer results — it may have been skipped before any reviewer ran."
          title="No reviewer outcomes"
        />
      ) : (
        <>
          <Tabs
            items={SEVERITY_TABS}
            onChange={(value) => setSeverity(value as 'all' | FindingSeverity)}
            value={severity}
          />
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
                  {outcome.status === 'failed' ? (
                    <Notice tone="error">{reviewerFailureMessage(outcome.error)}</Notice>
                  ) : outcome.status === 'pending' ? (
                    <p className="text-sm text-text-muted">
                      This reviewer has not finished yet — its findings will appear when the run
                      completes.
                    </p>
                  ) : null}
                  {outcome.summary ? (
                    <p className="whitespace-pre-wrap text-sm text-text-body">{outcome.summary}</p>
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
                                <code className="text-xs text-text-muted">
                                  {findingLocation(finding)}
                                </code>
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
        </>
      )}
    </div>
  );
}
