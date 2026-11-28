-- Up Migration
--
-- Providers, the model catalog, capability probes, reviewers, their versions, and repo bindings
-- (docs/architecture/data-model.md; ADR-0011, ADR-0016, ADR-0029, ADR-0030).

-- Keys are write-only and origin-bound (ADR-0011). Only the `local` kind has pinned addresses,
-- and it always has them (ADR-0030).
create table providers (
  id uuid primary key default uuid_v7(),
  org_id uuid not null references orgs (id) on delete cascade,
  kind text not null check (kind in ('openai_compatible', 'anthropic_compatible', 'local')),
  name text not null,
  base_url text not null,
  allowed_origin text not null,
  pinned_addresses inet[],
  secret_id uuid,
  status text not null default 'active' check (
    status in ('active', 'configuration_error', 'disabled')
  ),
  created_at timestamptz not null default now(),
  last_verified_at timestamptz,
  unique (org_id, id),
  unique (org_id, name),
  constraint providers_pinned_addresses_local_only check ((kind = 'local') = (pinned_addresses is not null)),
  foreign key (org_id, secret_id) references secrets (org_id, id)
);
create index providers_secret_idx on providers (org_id, secret_id);

-- Prices are per 1M tokens (provider-model-discovery §4) and null when unknown; budgets always
-- keep a token ceiling.
create table provider_models (
  id uuid primary key default uuid_v7(),
  org_id uuid not null references orgs (id) on delete cascade,
  provider_id uuid not null,
  model_id text not null,
  display_name text,
  context_window integer check (context_window > 0),
  max_output integer check (max_output > 0),
  input_price numeric(20, 9) check (input_price >= 0),
  output_price numeric(20, 9) check (output_price >= 0),
  cache_read_price numeric(20, 9) check (cache_read_price >= 0),
  cache_write_price numeric(20, 9) check (cache_write_price >= 0),
  capabilities jsonb not null default '{}',
  supported_endpoints text[] not null default '{}',
  pricing_source text check (pricing_source in ('provider', 'registry', 'admin')),
  source text not null,
  status text not null default 'available' check (status in ('available', 'removed')),
  last_seen_at timestamptz not null default now(),
  unique (org_id, id),
  unique (provider_id, model_id),
  foreign key (org_id, provider_id) references providers (org_id, id) on delete cascade
);

-- A binding needs a `passed` probe for its model, endpoint, and the current probe version
-- (ADR-0029). Synthetic fixtures only.
create table model_probes (
  id uuid primary key default uuid_v7(),
  org_id uuid not null references orgs (id) on delete cascade,
  provider_model_id uuid not null,
  endpoint text not null,
  probe_version integer not null check (probe_version >= 1),
  sdk_version text not null,
  status text not null check (status in ('running', 'passed', 'failed')),
  chosen_mode text,
  mode_results jsonb,
  reasoning_share real check (reasoning_share between 0 and 1),
  cache_read_seen boolean,
  tokens_used integer not null default 0 check (tokens_used >= 0),
  triggered_by text not null,
  actor_id uuid references users (id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint model_probes_passed_has_mode check (status <> 'passed' or chosen_mode is not null),
  foreign key (org_id, provider_model_id) references provider_models (org_id, id) on delete cascade
);
create index model_probes_lookup_idx on model_probes (org_id, provider_model_id, endpoint, probe_version);

create table reviewers (
  id uuid primary key default uuid_v7(),
  org_id uuid not null references orgs (id) on delete cascade,
  slug text not null,
  name text not null,
  role text not null,
  built_in boolean not null default false,
  status text not null default 'active' check (status in ('active', 'configuration_error', 'archived')),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (org_id, id),
  unique (org_id, slug)
);

-- Immutable once active (enforced by the store). `provider_model_id` overrides the model role.
create table reviewer_versions (
  id uuid primary key default uuid_v7(),
  org_id uuid not null references orgs (id) on delete cascade,
  reviewer_id uuid not null,
  version integer not null check (version >= 1),
  prompt_file_id text,
  prompt_hash text not null,
  instructions text,
  model_role text not null check (model_role in ('reasoning', 'fast')),
  provider_model_id uuid,
  params jsonb not null default '{}',
  output_schema jsonb,
  content_hash text not null,
  created_by uuid references users (id),
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  unique (org_id, id),
  unique (org_id, reviewer_id, id),
  unique (reviewer_id, version),
  foreign key (org_id, reviewer_id) references reviewers (org_id, id) on delete cascade,
  foreign key (org_id, provider_model_id) references provider_models (org_id, id)
);
create index reviewer_versions_provider_model_idx on reviewer_versions (org_id, provider_model_id);

-- The binding is the enablement (ADR-0013, ADR-0016). `reviewer_version_id` pins a version of the
-- same reviewer; null follows the reviewer's active version (reviewer-assignment-and-roles).
-- The `capability` selection is v1.2.
create table reviewer_repo_bindings (
  id uuid primary key default uuid_v7(),
  org_id uuid not null references orgs (id) on delete cascade,
  repository_id uuid not null,
  reviewer_id uuid not null,
  reviewer_version_id uuid,
  enabled boolean not null,
  selection text not null check (selection in ('required', 'default')),
  paths_include text[] not null default '{}',
  paths_exclude text[] not null default '{}',
  languages text[] not null default '{}',
  budget jsonb,
  created_by uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (repository_id, reviewer_id),
  foreign key (org_id, repository_id) references repositories (org_id, id) on delete cascade,
  foreign key (org_id, reviewer_id) references reviewers (org_id, id) on delete cascade,
  foreign key (org_id, reviewer_id, reviewer_version_id)
    references reviewer_versions (org_id, reviewer_id, id)
);
create index reviewer_repo_bindings_reviewer_idx on reviewer_repo_bindings (org_id, reviewer_id);

-- Down Migration

drop table reviewer_repo_bindings;
drop table reviewer_versions;
drop table reviewers;
drop table model_probes;
drop table provider_models;
drop table providers;
