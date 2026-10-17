import type { ActivityEntry, ActivityPage } from '@jury-forge/shared';

export const ACTIVITY_RETENTION_DAYS = 90;

export interface ActivityInput {
  actor: string;
  action: string;
  target?: string | null;
  detail?: string | null;
}

interface ActivityRow {
  id: number;
  at: number;
  actor: string;
  action: string;
  target: string | null;
  detail: string | null;
}

const ACTIVITY_COLUMNS = 'id, at, actor, action, target, detail';

function fromRow(row: ActivityRow): ActivityEntry {
  return {
    id: row.id,
    at: row.at,
    actor: row.actor,
    action: row.action,
    target: row.target,
    detail: row.detail,
  };
}

/** Parses a `"<at>:<id>"` keyset cursor; null when it is malformed. */
export function parseActivityCursor(cursor: string): { at: number; id: number } | null {
  const separator = cursor.indexOf(':');
  if (separator === -1) {
    return null;
  }
  const atPart = cursor.slice(0, separator);
  const idPart = cursor.slice(separator + 1);
  const at = Number(atPart);
  const id = Number(idPart);
  if (atPart === '' || idPart === '' || !Number.isInteger(at) || !Number.isInteger(id)) {
    return null;
  }
  return { at, id };
}

/**
 * Best-effort audit write (D-023): a failure must never fail the request that triggered it.
 */
export async function recordActivity(db: D1Database, entry: ActivityInput): Promise<void> {
  try {
    await db
      .prepare('INSERT INTO activity_log (actor, action, target, detail) VALUES (?, ?, ?, ?)')
      .bind(entry.actor, entry.action, entry.target ?? null, entry.detail ?? null)
      .run();
  } catch (error) {
    console.error('activity record failed:', error);
  }
}

/**
 * The activity trail, newest first, with a keyset cursor on `(at, id)` like the runs list.
 * Entries older than the retention window are pruned opportunistically before reading.
 */
export async function listActivity(
  db: D1Database,
  options: { limit: number; cursor?: string },
): Promise<ActivityPage> {
  await db
    .prepare('DELETE FROM activity_log WHERE at < unixepoch() - ?')
    .bind(ACTIVITY_RETENTION_DAYS * 86_400)
    .run();

  const cursor = options.cursor === undefined ? null : parseActivityCursor(options.cursor);
  if (options.cursor !== undefined && cursor === null) {
    throw new Error('invalid_cursor');
  }

  const rows =
    cursor === null
      ? await db
          .prepare(`SELECT ${ACTIVITY_COLUMNS} FROM activity_log ORDER BY at DESC, id DESC LIMIT ?`)
          .bind(options.limit)
          .all<ActivityRow>()
      : await db
          .prepare(
            `SELECT ${ACTIVITY_COLUMNS} FROM activity_log WHERE at < ? OR (at = ? AND id < ?) ORDER BY at DESC, id DESC LIMIT ?`,
          )
          .bind(cursor.at, cursor.at, cursor.id, options.limit)
          .all<ActivityRow>();

  const activity = rows.results.map(fromRow);
  const last = activity[activity.length - 1];
  return {
    activity,
    nextCursor: activity.length === options.limit && last ? `${last.at}:${last.id}` : null,
  };
}
