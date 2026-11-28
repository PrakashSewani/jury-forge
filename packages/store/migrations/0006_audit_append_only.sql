-- Up Migration
--
-- `audit_events` is append-only (data-model.md rule 6; security.md §10). UPDATE and TRUNCATE always
-- fail. DELETE works only inside a transaction that names its reason in the setting
-- `jury_forge.audit_delete`: 'retention' (the daily job, which deletes rows past their retention)
-- or 'org_purge' (deleting an org, which cascades to its audit rows). Owner decision 2026-11-28.
-- The guard protects against application mistakes, not against a database superuser.

create function audit_events_guard() returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE'
     and coalesce(current_setting('jury_forge.audit_delete', true), '') in ('retention', 'org_purge') then
    return old;
  end if;
  raise exception 'audit_events is append-only: % refused', tg_op
    using errcode = 'JF001',
          hint = 'Only the retention job and an org purge delete audit rows, and they set jury_forge.audit_delete.';
end
$$;

create trigger audit_events_no_update
  before update on audit_events
  for each row execute function audit_events_guard();

create trigger audit_events_flagged_delete_only
  before delete on audit_events
  for each row execute function audit_events_guard();

create trigger audit_events_no_truncate
  before truncate on audit_events
  for each statement execute function audit_events_guard();

-- Down Migration

drop trigger audit_events_no_truncate on audit_events;
drop trigger audit_events_flagged_delete_only on audit_events;
drop trigger audit_events_no_update on audit_events;
drop function audit_events_guard();
