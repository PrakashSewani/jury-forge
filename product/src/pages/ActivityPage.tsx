import type { ActivityEntry } from '@jury-forge/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { listActivity } from '../lib/api';
import { formatRelativeTime, formatTime } from '../lib/format';
import { useQueryState } from '../lib/use-query-state';
import { Badge, Button, Card, EmptyState, Field, Input, Select, Toolbar } from '../ui';
import type { Tone } from '../lib/format';
import { PageError, PageLoading } from './screen-state';

interface ActivityData {
  activity: ActivityEntry[];
  nextCursor: string | null;
}

interface ActionMeta {
  label: string;
  tone: Tone;
}

/** Human labels for the action codes the Worker records. An unknown code is shown as-is. */
const ACTION_META: Record<string, ActionMeta> = {
  sign_in: { label: 'Signed in', tone: 'green' },
  sign_out: { label: 'Signed out', tone: 'neutral' },
  'settings.update': { label: 'Changed settings', tone: 'amber' },
  'reviewer.create': { label: 'Created reviewer', tone: 'green' },
  'reviewer.update': { label: 'Edited reviewer', tone: 'amber' },
  'reviewer.delete': { label: 'Deleted reviewer', tone: 'red' },
  'repository.enable': { label: 'Enabled repository', tone: 'green' },
  'repository.disable': { label: 'Disabled repository', tone: 'neutral' },
  'run.kick': { label: 'Started review', tone: 'amber' },
  'credential.rotate': { label: 'Rotated credential', tone: 'amber' },
};

export function actionMeta(action: string): ActionMeta {
  return ACTION_META[action] ?? { label: action, tone: 'neutral' };
}

function dayKey(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1_000);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(unixSeconds: number, nowMs = Date.now()): string {
  const date = new Date(unixSeconds * 1_000);
  const today = new Date(nowMs);
  const yesterday = new Date(nowMs - 86_400_000);
  if (dayKey(unixSeconds) === dayKey(today.getTime() / 1_000)) return 'Today';
  if (dayKey(unixSeconds) === dayKey(yesterday.getTime() / 1_000)) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

/** Group entries by calendar day, keeping the API's newest-first order inside each day. */
export function groupByDay(entries: ActivityEntry[], nowMs = Date.now()) {
  const groups: { key: string; label: string; entries: ActivityEntry[] }[] = [];
  for (const entry of entries) {
    const key = dayKey(entry.at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.entries.push(entry);
    } else {
      groups.push({ key, label: dayLabel(entry.at, nowMs), entries: [entry] });
    }
  }
  return groups;
}

/** Match a free-text term against every field a person would search by. */
export function matches(entry: ActivityEntry, term: string): boolean {
  if (term === '') return true;
  const needle = term.toLowerCase();
  const haystack = [
    entry.actor,
    entry.action,
    actionMeta(entry.action).label,
    entry.target ?? '',
    entry.detail ?? '',
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

export default function ActivityPage() {
  const [data, setData] = useState<ActivityData | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [term, setTerm] = useQueryState('q', '');
  const [actor, setActor] = useQueryState('actor', 'all');
  const [action, setAction] = useQueryState('action', 'all');

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
  const filtered = useMemo(
    () =>
      (data?.activity ?? []).filter(
        (entry) =>
          (actor === 'all' || entry.actor === actor) &&
          (action === 'all' || entry.action === action) &&
          matches(entry, term.trim()),
      ),
    [data, actor, action, term],
  );
  const groups = useMemo(() => groupByDay(filtered), [filtered]);
  const filtersActive = term.trim() !== '' || actor !== 'all' || action !== 'all';

  function clearFilters() {
    setTerm('');
    setActor('all');
    setAction('all');
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Activity</h1>
          <p className="mt-1 text-sm text-text-muted">
            Sign-ins, settings, reviewer and repository changes, and review runs, newest first.
          </p>
        </div>
      </header>

      {failed ? (
        <Card>
          <PageError
            message="The activity trail could not be loaded. Check the Worker and try again."
            onRetry={load}
          />
        </Card>
      ) : data === null ? (
        <PageLoading />
      ) : data.activity.length === 0 ? (
        <EmptyState
          description="Sign-ins, setting changes, reviewer edits, and run kicks are recorded here as they happen."
          title="No activity yet"
        />
      ) : (
        <>
          <Toolbar className="flex-wrap">
            <Field className="min-w-56 flex-[2] sm:max-w-80" label="Search">
              <Input
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Actor, action, repository, or detail"
                type="search"
                value={term}
              />
            </Field>
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
                {actions.map((code) => (
                  <option key={code} value={code}>
                    {actionMeta(code).label}
                  </option>
                ))}
              </Select>
            </Field>
          </Toolbar>

          {filtered.length === 0 ? (
            <EmptyState
              action={
                filtersActive ? (
                  <Button onClick={clearFilters} size="sm" variant="secondary">
                    Clear filters
                  </Button>
                ) : null
              }
              description="Nothing in the trail matches these filters."
              title="No matching activity"
            />
          ) : (
            <div className="space-y-6">
              {groups.map((group) => (
                <section aria-labelledby={`day-${group.key}`} key={group.key}>
                  <h2
                    className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted"
                    id={`day-${group.key}`}
                  >
                    {group.label}
                  </h2>
                  <ol className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
                    {group.entries.map((entry) => (
                      <ActivityRow entry={entry} key={entry.id} />
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          )}

          {data.nextCursor !== null ? (
            <div>
              <Button busy={loadingMore} onClick={() => void loadMore()} variant="secondary">
                {loadingMore ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const meta = actionMeta(entry.action);
  const known = ACTION_META[entry.action] !== undefined;
  return (
    <li className="grid gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          <span className="text-sm font-medium">{entry.actor}</span>
          {entry.target ? (
            <span className="min-w-0 truncate font-mono text-xs text-text-body">
              {entry.target}
            </span>
          ) : null}
        </div>
        {entry.detail ? <p className="truncate text-sm text-text-muted">{entry.detail}</p> : null}
        {known ? null : <p className="font-mono text-xs text-text-subtle">{entry.action}</p>}
      </div>
      <time
        className="whitespace-nowrap text-xs text-text-muted"
        dateTime={new Date(entry.at * 1_000).toISOString()}
        title={formatTime(entry.at)}
      >
        {formatRelativeTime(entry.at)}
      </time>
    </li>
  );
}
