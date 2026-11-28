-- Up Migration
--
-- Foundation: UUIDv7 ids, identity, the tenant root and the instance org, instance settings,
-- encrypted secrets, the audit log, artefacts, and worker heartbeats.
-- docs/architecture/data-model.md; ADR-0035 (tenant key), ADR-0037 (worker heartbeats).
--
-- Conventions for every migration in this directory:
-- - ids are UUIDv7 (technical-approach §15); times are timestamptz (UTC).
-- - every tenant-owned table has `org_id uuid not null` and `unique (org_id, id)`, and references
--   other tenant tables with composite keys `(org_id, <parent>_id)` (ADR-0035).
-- - ownership edges cascade on delete; reference edges keep the default NO ACTION, so deleting a
--   row that history still points at fails, while deleting an org cascades through everything.
-- - enumerations are `text` with a CHECK, so a value can be added in an expand step.

-- UUIDv7 (RFC 9562): 48-bit Unix time in milliseconds, version 7, variant 10, random bits.
-- PostgreSQL 17 has no built-in generator. It takes a random v4 UUID, overwrites its first six
-- bytes with the time, and turns version 4 (0100) into 7 (0111) by setting bits 52 and 53.
create function uuid_v7() returns uuid
language sql volatile parallel safe
as $$
  select encode(
    set_bit(
      set_bit(
        overlay(
          uuid_send(gen_random_uuid())
          placing substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3)
          from 1 for 6
        ),
        52, 1
      ),
      53, 1
    ),
    'hex'
  )::uuid
$$;

-- Instance-level identity: a GitHub user may belong to several orgs later (ADR-0035 exception).
create table users (
  id uuid primary key default uuid_v7(),
  github_id bigint not null unique,
  login text not null,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- The tenant root. `slug` and `name` are filled at the owner claim (WP 1-16).
create table orgs (
  id uuid primary key default uuid_v7(),
  slug text unique,
  name text,
  owner_user_id uuid references users (id),
  created_at timestamptz not null default now()
);

-- The instance org exists before setup, unclaimed, so rows written before the claim have a tenant
-- (ADR-0035 decision 5).
insert into orgs default values;

create table user_sessions (
  id uuid primary key default uuid_v7(),
  user_id uuid not null references users (id) on delete cascade,
  token_hash bytea not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  idle_expires_at timestamptz not null,
  absolute_expires_at timestamptz not null,
  revoked_at timestamptz
);
create index user_sessions_user_id_idx on user_sessions (user_id);

create table instance_settings (
  org_id uuid not null references orgs (id) on delete cascade,
  key text not null,
  value jsonb not null,
  version integer not null default 1 check (version >= 1),
  updated_by uuid references users (id),
  updated_at timestamptz not null default now(),
  primary key (org_id, key)
);

-- Envelope encryption: a DEK per secret wrapped by the KEK from JURY_MASTER_KEY_FILE.
create table secrets (
  id uuid primary key default uuid_v7(),
  org_id uuid not null references orgs (id) on delete cascade,
  kind text not null check (
    kind in (
      'github_app_private_key',
      'github_client_secret',
      'github_webhook_secret',
      'provider_api_key',
      'receipt_signing_key'
    )
  ),
  ciphertext bytea not null,
  wrapped_dek bytea not null,
  key_id text not null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  unique (org_id, id)
);

-- The append-only trigger is WP 1-09. `turn_id` has no foreign key: audit outlives turns.
create table audit_events (
  id uuid primary key default uuid_v7(),
  org_id uuid not null references orgs (id) on delete cascade,
  actor_type text not null,
  actor_id text,
  action text not null,
  target_type text,
  target_id text,
  before jsonb,
  after jsonb,
  request_id text,
  turn_id uuid,
  ip inet,
  at timestamptz not null default now()
);
create index audit_events_org_at_idx on audit_events (org_id, at);

-- Bounded bytes kept in Postgres (no object store in v1): at most 2 MiB each, with an expiry.
create table artefacts (
  id uuid primary key default uuid_v7(),
  org_id uuid not null references orgs (id) on delete cascade,
  kind text not null check (
    kind in ('diff', 'provider_request', 'provider_response', 'webhook_payload', 'export')
  ),
  bytes bytea not null,
  size integer not null,
  sha256 bytea not null,
  redacted boolean not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (org_id, id),
  constraint artefacts_size_matches check (size = octet_length(bytes)),
  constraint artefacts_size_cap check (size <= 2097152),
  constraint artefacts_sha256_length check (octet_length(sha256) = 32)
);
create index artefacts_expires_at_idx on artefacts (expires_at);

-- Worker liveness for releasing a dead worker's queue locks (ADR-0037). Instance-level: no org_id.
-- `pool_id` is graphile-worker's worker pool id, the value it writes to `locked_by`.
create table worker_heartbeats (
  pool_id text primary key,
  host text,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  released_at timestamptz
);

-- Down Migration

drop table worker_heartbeats;
drop table artefacts;
drop table audit_events;
drop table secrets;
drop table instance_settings;
drop table user_sessions;
drop table orgs;
drop table users;
drop function uuid_v7();
