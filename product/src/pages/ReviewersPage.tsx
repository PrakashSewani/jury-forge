import { useCallback } from 'react';
import { Badge, buttonClass, Card, LoadFailed, Loading } from '../components';
import { listReviewers } from '../lib/api';
import { useLoadable } from '../lib/use-loadable';

export default function ReviewersPage() {
  const load = useCallback(() => listReviewers(), []);
  const { data, failed, reload } = useLoadable(load);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Reviewers</h1>
        <a className={buttonClass} href="/reviewers/new">
          New reviewer
        </a>
      </header>
      <Card>
        {failed ? (
          <LoadFailed onRetry={reload} />
        ) : data === null ? (
          <Loading />
        ) : data.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No reviewers yet — create one to give your jury its first member.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {data.map((reviewer) => (
              <li key={reviewer.id}>
                <a
                  className="flex items-center justify-between gap-4 py-3 transition hover:bg-neutral-50"
                  href={`/reviewers/${encodeURIComponent(reviewer.id)}`}
                >
                  <div>
                    <p className="text-sm font-medium">{reviewer.name}</p>
                    <p className="text-xs text-neutral-500">
                      {reviewer.flavor} · {reviewer.model}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {reviewer.hasApiKey ? null : <Badge tone="amber">no key</Badge>}
                    {reviewer.enabled ? (
                      <Badge tone="green">enabled</Badge>
                    ) : (
                      <Badge>disabled</Badge>
                    )}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
