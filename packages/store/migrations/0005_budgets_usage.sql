-- Up Migration
--
-- Budgets (ADR-0024 §7, checked in `domain` before every model call) and usage rollups.
-- `scope_id` is polymorphic and has no foreign key: a session, repository, or installation id, or
-- a requester's GitHub login. A null `scope_id` on a budget applies to every scope of its type.
-- Cost columns are integer micro-units of the price currency.

create table budgets (
  id uuid primary key default uuid_v7(),
  org_id uuid not null references orgs (id) on delete cascade,
  scope_type text not null check (scope_type in ('session', 'repo', 'installation', 'requester')),
  scope_id text,
  period text not null check (period in ('turn', 'day', 'week', 'month')),
  token_limit bigint check (token_limit > 0),
  cost_limit_micros bigint check (cost_limit_micros > 0),
  action text not null check (action in ('warn', 'block')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_has_limit check (token_limit is not null or cost_limit_micros is not null)
);
create index budgets_scope_idx on budgets (org_id, scope_type, scope_id);

create table usage_rollups (
  org_id uuid not null references orgs (id) on delete cascade,
  scope_type text not null check (scope_type in ('session', 'repo', 'installation', 'requester')),
  scope_id text not null,
  period_start timestamptz not null,
  tokens bigint not null default 0 check (tokens >= 0),
  cost_micros bigint not null default 0 check (cost_micros >= 0),
  turns integer not null default 0 check (turns >= 0),
  primary key (org_id, scope_type, scope_id, period_start)
);

-- Down Migration

drop table usage_rollups;
drop table budgets;
