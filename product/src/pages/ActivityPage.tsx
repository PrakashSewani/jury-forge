import type { ActivityEntry } from '@jury-forge/shared';
import { useCallback, useEffect, useState } from 'react';
import { Card, LoadFailed, Loading, secondaryButtonClass } from '../components';
import { listActivity } from '../lib/api';
import { formatTime } from '../lib/format';

interface ActivityData {
  activity: ActivityEntry[];
  nextCursor: string | null;
}

export default function ActivityPage() {
  const [data, setData] = useState<ActivityData | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setData(await listActivity());
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore() {
    if (data === null || data.nextCursor === null) {
      return;
    }
    setLoadingMore(true);
    try {
      const page = await listActivity(data.nextCursor);
      setData((current) =>
        current === null
          ? current
          : { activity: [...current.activity, ...page.activity], nextCursor: page.nextCursor },
      );
    } catch {
      // Keep the current page; the button stays available for another try.
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Activity</h1>
      </header>
      <Card>
        {failed ? (
          <LoadFailed onRetry={load} />
        ) : data === null ? (
          <Loading />
        ) : data.activity.length === 0 ? (
          <p className="text-sm text-neutral-500">No activity yet.</p>
        ) : (
          <>
            <ul className="divide-y divide-neutral-100">
              {data.activity.map((entry) => (
                <li className="py-3" key={entry.id}>
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-medium">{entry.action}</p>
                    <p className="text-xs text-neutral-500">{formatTime(entry.at)}</p>
                  </div>
                  <p className="text-xs text-neutral-500">
                    {entry.actor}
                    {entry.target ? ` · ${entry.target}` : ''}
                  </p>
                  {entry.detail ? (
                    <p className="mt-1 text-xs text-neutral-500">{entry.detail}</p>
                  ) : null}
                </li>
              ))}
            </ul>
            {data.nextCursor !== null ? (
              <button
                className={secondaryButtonClass}
                disabled={loadingMore}
                onClick={() => void loadMore()}
                type="button"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}
