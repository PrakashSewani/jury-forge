-- Up Migration
--
-- PR sessions, threads, messages, turns, steps, findings, fingerprints, coverage, resolutions, and
-- feedback (docs/architecture/data-model.md; ADR-0024, ADR-0025, ADR-0032).
-- Child rows that name a thread or a turn name it together with their session, so a row can never
-- point at another session's thread or turn.

-- One session per (installation, repository, PR). The single composite key also proves that the
-- repository belongs to that installation.
create table pr_sessions (
  id uuid primary key default uuid_v7(),
  org_id uuid not null references orgs (id) on delete cascade,
  installation_id uuid not null,
  repository_id uuid not null,
  pr_number integer not null check (pr_number > 0),
  state text not null default 'created' check (
    state in ('created', 'active', 'waiting_for_user', 'resolved', 'archived')
  ),
  generation integer not null default 0 check (generation >= 0),
  needs_human_reason text,
  last_turn_at timestamptz,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (org_id, id),
  unique (installation_id, repository_id, pr_number),
  foreign key (org_id, installation_id, repository_id)
    references repositories (org_id, installation_id, id) on delete cascade
);
create index pr_sessions_repository_idx on pr_sessions (org_id, repository_id);

-- One per review-comment thread; only bot-owned threads can be bot-resolved (`auto`).
create table session_threads (
  id uuid primary key default uuid_v7(),
  org_id uuid not null references orgs (id) on delete cascade,
  session_id uuid not null,
  github_thread_id text,
  file text,
  line integer,
  created_by text not null check (created_by in ('agent', 'user')),
  owner_reviewer_id uuid,
  state text not null default 'open' check (state in ('open', 'resolved', 'outdated')),
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, session_id, id),
  unique (session_id, github_thread_id),
  foreign key (org_id, session_id) references pr_sessions (org_id, id) on delete cascade,
  foreign key (org_id, owner_reviewer_id) references reviewers (org_id, id)
);
create index session_threads_owner_reviewer_idx on session_threads (org_id, owner_reviewer_id);

-- The durable unit of work, serialized per session by the queue. `stop_reason` records why a turn
-- that did not complete stopped (for example `stuck` or `verifier_unavailable`).
create table session_turns (
  id uuid primary key default uuid_v7(),
  org_id uuid not null references orgs (id) on delete cascade,
  session_id uuid not null,
  generation integer not null check (generation >= 0),
  trigger text not null check (trigger in ('check_run', 'label', 'ui', 'reply', 'push', 'policy')),
  intent text,
  status text not null default 'queued' check (
    status in ('queued', 'running', 'completed', 'failed', 'superseded', 'budget_stopped')
  ),
  stop_reason text,
  config_snapshot jsonb,
  cost_micros bigint not null default 0 check (cost_micros >= 0),
  tokens bigint not null default 0 check (tokens >= 0),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  unique (org_id, id),
  unique (org_id, session_id, id),
  foreign key (org_id, session_id) references pr_sessions (org_id, id) on delete cascade
);
create index session_turns_session_idx on session_turns (org_id, session_id, created_at);
-- The stuck-turn sweep (technical-approach §3.3) looks for long-running turns.
create index session_turns_running_idx on session_turns (started_at) where status = 'running';

-- A retried job reads finished steps back instead of redoing them.
create table turn_steps (
  org_id uuid not null references orgs (id) on delete cascade,
  turn_id uuid not null,
  step text not null,
  input_hash text not null,
  output jsonb,
  tokens bigint not null default 0 check (tokens >= 0),
  ms integer not null default 0 check (ms >= 0),
  created_at timestamptz not null default now(),
  primary key (turn_id, step),
  foreign key (org_id, turn_id) references session_turns (org_id, id) on delete cascade
);
create index turn_steps_org_turn_idx on turn_steps (org_id, turn_id);

-- Append-only; the body lives in message_versions.
create table session_messages (
  id uuid primary key default uuid_v7(),
  org_id uuid not null references orgs (id) on delete cascade,
  session_id uuid not null,
  thread_id uuid,
  role text not null check (role in ('user', 'agent', 'system')),
  reviewer_version_id uuid,
  github_comment_id bigint,
  author_login text,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (session_id, github_comment_id),
  foreign key (org_id, session_id) references pr_sessions (org_id, id) on delete cascade,
  foreign key (org_id, session_id, thread_id)
    references session_threads (org_id, session_id, id) on delete cascade,
  foreign key (org_id, reviewer_version_id) references reviewer_versions (org_id, id)
);
create index session_messages_thread_idx on session_messages (org_id, session_id, thread_id);
create index session_messages_reviewer_version_idx on session_messages (org_id, reviewer_version_id);

-- ADR-0024 §3: a turn answers one version of a message.
create table message_versions (
  id uuid primary key default uuid_v7(),
  org_id uuid not null references orgs (id) on delete cascade,
  session_message_id uuid not null,
  body_hash text not null,
  body text not null,
  observed_at timestamptz not null default now(),
  answered_by_turn_id uuid,
  unique (org_id, id),
  unique (session_message_id, body_hash),
  foreign key (org_id, session_message_id) references session_messages (org_id, id) on delete cascade,
  foreign key (org_id, answered_by_turn_id)
    references session_turns (org_id, id) on delete set null (answered_by_turn_id)
);
create index message_versions_answered_by_idx on message_versions (org_id, answered_by_turn_id);

-- Severity follows ADR-0032; status follows ADR-0024. `external_id` is the GitHub comment id used
-- for idempotent publishing.
create table session_findings (
  id uuid primary key default uuid_v7(),
  org_id uuid not null references orgs (id) on delete cascade,
  session_id uuid not null,
  thread_id uuid,
  turn_id uuid not null,
  reviewer_version_id uuid not null,
  fingerprint text not null,
  category text not null,
  severity text not null check (severity in ('critical', 'high', 'medium', 'low')),
  file text not null,
  line integer,
  start_line integer,
  anchor_hash text,
  status text not null default 'open' check (
    status in (
      'open', 'fix_candidate', 'verified_fixed', 'outdated', 'addressed', 'dismissed', 'resolved',
      'reopened'
    )
  ),
  evidence jsonb,
  confidence real check (confidence between 0 and 1),
  external_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, session_id) references pr_sessions (org_id, id) on delete cascade,
  foreign key (org_id, session_id, thread_id)
    references session_threads (org_id, session_id, id) on delete set null (thread_id),
  foreign key (org_id, session_id, turn_id) references session_turns (org_id, session_id, id),
  foreign key (org_id, reviewer_version_id) references reviewer_versions (org_id, id)
);
create index session_findings_session_fingerprint_idx on session_findings (org_id, session_id, fingerprint);
create index session_findings_thread_idx on session_findings (org_id, session_id, thread_id);
create index session_findings_turn_idx on session_findings (org_id, session_id, turn_id);
create index session_findings_reviewer_version_idx on session_findings (org_id, reviewer_version_id);

-- ADR-0024 §4: code-assigned identity, unique per repository (ADR-0035 decision 3).
create table finding_fingerprints (
  org_id uuid not null references orgs (id) on delete cascade,
  repository_id uuid not null,
  fingerprint text not null,
  category text not null,
  path text not null,
  anchor_hash text,
  first_seen_turn_id uuid,
  last_state text not null check (
    last_state in (
      'open', 'fix_candidate', 'verified_fixed', 'outdated', 'addressed', 'dismissed', 'resolved',
      'reopened'
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, repository_id, fingerprint),
  foreign key (org_id, repository_id) references repositories (org_id, id) on delete cascade,
  foreign key (org_id, first_seen_turn_id)
    references session_turns (org_id, id) on delete set null (first_seen_turn_id)
);
create index finding_fingerprints_first_seen_idx on finding_fingerprints (org_id, first_seen_turn_id);

-- ADR-0025 §2: what each file got in a turn; part of the receipt.
create table coverage_manifests (
  id uuid primary key default uuid_v7(),
  org_id uuid not null references orgs (id) on delete cascade,
  turn_id uuid not null unique,
  files jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (org_id, turn_id) references session_turns (org_id, id) on delete cascade
);

-- ADR-0024 §6: in `suggest` the actor is the human who resolved; `auto` is guarded.
create table resolutions (
  id uuid primary key default uuid_v7(),
  org_id uuid not null references orgs (id) on delete cascade,
  thread_id uuid not null,
  actor_type text not null check (actor_type in ('user', 'agent')),
  actor_id text not null,
  mode text not null check (mode in ('suggest', 'auto', 'off')),
  evidence jsonb,
  confidence real check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  foreign key (org_id, thread_id) references session_threads (org_id, id) on delete cascade
);
create index resolutions_thread_idx on resolutions (org_id, thread_id);

-- Feedback from the UI comes from an instance user; a GitHub reaction may come from anyone with
-- repo access, so it records the login.
create table finding_feedback (
  id uuid primary key default uuid_v7(),
  org_id uuid not null references orgs (id) on delete cascade,
  finding_id uuid not null,
  user_id uuid references users (id),
  author_login text,
  source text not null check (source in ('button', 'reaction')),
  verdict text not null check (verdict in ('helpful', 'wrong', 'fixed', 'duplicate')),
  reason text,
  created_at timestamptz not null default now(),
  constraint finding_feedback_has_author check (user_id is not null or author_login is not null),
  foreign key (org_id, finding_id) references session_findings (org_id, id) on delete cascade
);
create index finding_feedback_finding_idx on finding_feedback (org_id, finding_id);

-- Down Migration

drop table finding_feedback;
drop table resolutions;
drop table coverage_manifests;
drop table finding_fingerprints;
drop table session_findings;
drop table message_versions;
drop table session_messages;
drop table turn_steps;
drop table session_turns;
drop table session_threads;
drop table pr_sessions;
