// The audit log: append-only (migration 0006; security.md §10). This module only appends; reads and
// export arrive with the audit UI and export work. Callers pass values that are already redacted:
// a secret never goes into `before` or `after`.

import type { Json } from './db.generated.ts';
import type { TenantScope } from './store.ts';

export interface AuditEvent {
  /** Who acted, for example `user`, `system`, or `agent`. */
  actorType: string;
  actorId?: string | null;
  /** A dotted action name, for example `origin.set`. */
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  before?: Json | null;
  after?: Json | null;
  requestId?: string | null;
  turnId?: string | null;
  ip?: string | null;
}

/** Appends one audit event to the scope's org and returns its id. */
export async function appendAudit(scope: TenantScope, event: AuditEvent): Promise<string> {
  if (event.actorType === '' || event.action === '') {
    throw new Error('An audit event needs an actor type and an action.');
  }
  const row = await scope
    .insertInto('audit_events', {
      actor_type: event.actorType,
      actor_id: event.actorId ?? null,
      action: event.action,
      target_type: event.targetType ?? null,
      target_id: event.targetId ?? null,
      // Sent as JSON text so that arrays stay JSON and do not become Postgres arrays.
      before:
        event.before === undefined || event.before === null ? null : JSON.stringify(event.before),
      after: event.after === undefined || event.after === null ? null : JSON.stringify(event.after),
      request_id: event.requestId ?? null,
      turn_id: event.turnId ?? null,
      ip: event.ip ?? null,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}
