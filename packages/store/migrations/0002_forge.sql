-- Up Migration
--
-- Forge: installations, repositories, and webhook deliveries (docs/architecture/data-model.md).
-- The GitHub App's own credentials are instance settings plus `secrets` rows, not columns here.

create table installations (
  id uuid primary key default uuid_v7(),
  org_id uuid not null references orgs (id) on delete cascade,
  forge text not null check (forge in ('github')),
  base_url text not null,
  external_id bigint not null,
  account_login text not null,
  account_type text not null check (account_type in ('user', 'organization')),
  status text not null default 'active' check (status in ('active', 'suspended', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (forge, base_url, external_id)
);

-- No enable toggle (ADR-0013): a reviewer binding is the enablement.
create table repositories (
  id uuid primary key default uuid_v7(),
  org_id uuid not null references orgs (id) on delete cascade,
  installation_id uuid not null,
  external_id bigint not null,
  full_name text not null,
  private boolean not null,
  default_branch text not null,
  language text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, installation_id, id),
  unique (installation_id, external_id),
  foreign key (org_id, installation_id) references installations (org_id, id) on delete cascade
);

-- Unique delivery_id is the webhook idempotency key; the row and its job are inserted in one
-- transaction (technical-approach §5.1). A delivery may arrive before its installation row exists
-- (the `installation` event), so `installation_id` is nullable. The raw payload is an artefact.
create table webhook_deliveries (
  id uuid primary key default uuid_v7(),
  org_id uuid not null references orgs (id) on delete cascade,
  installation_id uuid,
  delivery_id text not null unique,
  event text not null,
  action text,
  payload_artefact_id uuid,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received' check (
    status in ('received', 'processed', 'ignored', 'failed')
  ),
  foreign key (org_id, installation_id)
    references installations (org_id, id) on delete set null (installation_id),
  foreign key (org_id, payload_artefact_id)
    references artefacts (org_id, id) on delete set null (payload_artefact_id)
);
create index webhook_deliveries_installation_idx on webhook_deliveries (org_id, installation_id);
create index webhook_deliveries_artefact_idx on webhook_deliveries (org_id, payload_artefact_id);
create index webhook_deliveries_received_at_idx on webhook_deliveries (received_at);

-- Down Migration

drop table webhook_deliveries;
drop table repositories;
drop table installations;
