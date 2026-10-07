import type { RunDetail } from '@jury-forge/shared';
import { useCallback } from 'react';
import { Badge, Card, LoadFailed, Loading, Notice } from '../components';
import { getRun, listReviewers } from '../lib/api';
import { formatTime, runStatusTone, severityTone, shortSha } from '../lib/format';
import { useLoadable } from '../lib/use-loadable';

interface DetailData {
  detail: RunDetail;
  names: Map<string, string>;
}

export default function RunDetailPage({ id }: { id: string }) {
  const load = useCallback(async (): Promise<DetailData> => {
    const [detail, reviewers] = await Promise.all([getRun(id), listReviewers()]);
    return { detail, names: new Map(reviewers.map((reviewer) => [reviewer.id, reviewer.name])) };
  }, [id]);
  const { data, failed, reload } = useLoadable(load);

  if (failed) {
    return (
      <Card>
        <LoadFailed onRetry={reload} />
      </Card>
    );
  }
  if (data === null) {
    return <Loading />;
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
              className="text-sm text-neutral-500 underline underline-offset-4 transition hover:text-neutral-900"
              href={run.reviewUrl}
            >
              View on GitHub
            </a>
          ) : null}
        </div>
        <p className="text-xs text-neutral-500">
          repo {run.repoId} · {run.event} · started {formatTime(run.createdAt)} · finished{' '}
          {formatTime(run.finishedAt)}
        </p>
      </header>
      {run.error ? <Notice tone="error">{run.error}</Notice> : null}
      {detail.reviewers.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-500">No reviewer outcomes recorded for this run.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {detail.reviewers.map((outcome) => (
            <Card
              key={outcome.reviewerId}
              title={names.get(outcome.reviewerId) ?? outcome.reviewerId}
            >
              <div className="flex items-center gap-2">
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
                <span className="text-xs text-neutral-500">
                  {outcome.findings?.length ?? 0} finding(s)
                </span>
              </div>
              {outcome.status === 'failed' && outcome.error ? (
                <Notice tone="error">{outcome.error}</Notice>
              ) : null}
              {outcome.findings && outcome.findings.length > 0 ? (
                <ul className="space-y-3">
                  {outcome.findings.map((finding, index) => (
                    <li
                      className="space-y-1"
                      key={`${finding.file}-${finding.line ?? 'x'}-${index}`}
                    >
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <Badge tone={severityTone(finding.severity)}>{finding.severity}</Badge>
                        <span className="font-medium">{finding.title}</span>
                        <code className="text-xs text-neutral-500">
                          {finding.file}
                          {finding.line === undefined ? '' : `:${finding.line}`}
                        </code>
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-neutral-600">{finding.body}</p>
                    </li>
                  ))}
                </ul>
              ) : outcome.status === 'completed' ? (
                <p className="text-sm text-neutral-500">No findings.</p>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
