import type { ActivityEntry } from '@jury-forge/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { listActivity } from '../lib/api';
import { formatTime } from '../lib/format';
import { Button, Card, EmptyState, Field, Row, Select, Table, Toolbar } from '../ui';
import { PageError, PageLoading } from './screen-state';

interface ActivityData {
  activity: ActivityEntry[];
  nextCursor: string | null;
}

export default function ActivityPage() {
  const [data, setData] = useState<ActivityData | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actor, setActor] = useState('all');
  const [action, setAction] = useState('all');

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

  const actors = useMemo(
    () => [...new Set(data?.activity.map((entry) => entry.actor) ?? [])].sort(),
    [data],
  );
  const actions = useMemo(
    () => [...new Set(data?.activity.map((entry) => entry.action) ?? [])].sort(),
    [data],
  );
  const filtered = (data?.activity ?? []).filter(
    (entry) =>
      (actor === 'all' || entry.actor === actor) && (action === 'all' || entry.action === action),
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Activity</h1>
      </header>
      <Card>
        {failed ? (
          <PageError
            message="The activity trail could not be loaded. Check the Worker and try again."
            onRetry={load}
          />
        ) : data === null ? (
          <PageLoading />
        ) : data.activity.length === 0 ? (
          <EmptyState
            description="Sign-ins, setting changes, reviewer edits, and run kicks are recorded here as they happen."
            title="No activity yet"
          />
        ) : (
          <>
            <Toolbar className="mb-4 flex-wrap">
              <Field className="min-w-40 flex-1 sm:max-w-56" label="Actor">
                <Select onChange={(event) => setActor(event.target.value)} value={actor}>
                  <option value="all">All actors</option>
                  {actors.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field className="min-w-40 flex-1 sm:max-w-56" label="Action">
                <Select onChange={(event) => setAction(event.target.value)} value={action}>
                  <option value="all">All actions</option>
                  {actions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </Select>
              </Field>
            </Toolbar>
            <Table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                  <th className="py-2 pr-4 font-medium">Time</th>
                  <th className="py-2 pr-4 font-medium">Actor</th>
                  <th className="py-2 pr-4 font-medium">Action</th>
                  <th className="py-2 pr-4 font-medium">Target</th>
                  <th className="py-2 pr-4 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <Row>
                    <td className="py-6 text-center text-sm text-text-muted" colSpan={5}>
                      No activity matches these filters.
                    </td>
                  </Row>
                ) : (
                  filtered.map((entry) => (
                    <Row className="border-b border-border last:border-0" key={entry.id}>
                      <td className="whitespace-nowrap pr-4 text-text-muted">
                        {formatTime(entry.at)}
                      </td>
                      <td className="pr-4">{entry.actor}</td>
                      <td className="pr-4 font-medium">{entry.action}</td>
                      <td className="pr-4 text-text-body">{entry.target ?? '—'}</td>
                      <td className="max-w-xs pr-4 text-text-body">{entry.detail ?? '—'}</td>
                    </Row>
                  ))
                )}
              </tbody>
            </Table>
            {data.nextCursor !== null ? (
              <div className="mt-4">
                <Button busy={loadingMore} onClick={() => void loadMore()} variant="secondary">
                  {loadingMore ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}
