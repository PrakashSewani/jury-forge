# Data model

Field-level reference for the PostgreSQL 17 schema of the accepted v1 stack
([`technical-approach.md`](technical-approach.md) §3.2 and §17, ADR-0004, ADR-0026). Table names
are normative for docs and contracts; column lists and types are indicative, and the SQL migrations
written in M1.1 (WP 1-08) are the DDL. If this document and a migration disagree, fix one of them in
the same pull request.

Each table carries a **tier**: **MVP** (the first migrations, gate G1), **v1** (added by the v1
migrations), **v1.1**, or **v1.2**. Nothing is built ahead of its tier.

## Design rules

1. **Every row is tenant-scoped** by `org_id`, directly or through a parent. The `store` package's
   repositories always filter by org, and cross-tenant tests prove it. Row-level security is **not
   used in v1**; revisit it with multi-installation (technical-approach §3.2).
2. **Configuration is versioned.** A turn references the exact reviewer versions, instruction files,
   and model bindings it used. Mutation never rewrites history.
3. **Postgres is the only datastore.** Relational data, the queue, the audit log, and artefacts all
   live here. Large bytes (raw diffs, model requests and responses, exports) are `bytea` rows in
   `artefacts`, each at most 2 MB, with `expires_at`. There is no object store in v1; an optional
   S3 adapter is v1.2.
4. **The queue is graphile-worker's own schema.** Jury Forge does not define job, lease, or
   dead-letter tables. Durable progress lives in `session_turns` and `turn_steps`.
5. **Every external effect has an idempotency key.** Step results are unique by `(turn_id, step)`;
   a publish checks a stored `external_id` before posting (technical-approach §3.3).
6. **Audit is append-only.** A trigger blocks `UPDATE` and `DELETE` on `audit_events`.
7. **IDs are UUIDv7; times are UTC** (technical-approach §15).
8. **Deletion is explicit and cascading.** Retention is a policy run by the daily retention job.

## Instance, tenancy, and identity

| Table | Tier | Key fields | Notes |
| ----- | ---- | ---------- | ----- |
| `orgs` | MVP | `id`, `slug`, `name`, `owner_user_id`, `created_at` | The tenant. v1 is single-org per instance, but every table carries `org_id`. `owner_user_id` is the claimed owner (first-run-setup Stage 3). |
| `users` | MVP | `id`, `github_id`, `login`, `display_name`, `avatar_url`, `created_at` | Identity from GitHub OAuth. OIDC is v1.2. |
| `user_sessions` | MVP | `id`, `user_id`, `token_hash`, `created_at`, `last_seen_at`, `idle_expires_at`, `absolute_expires_at`, `revoked_at` | Opaque random IDs stored hashed; idle 8 h, absolute 7 d (technical-approach §3.9). |
| `instance_settings` | MVP | `org_id`, `key`, `value`, `version`, `updated_by`, `updated_at` | Layer 2 of the configuration model (technical-approach §14): set through the UI, versioned, audited. Includes `public_url` (ADR-0021) and the setup state. |
| `secrets` | MVP | `id`, `org_id`, `kind`, `ciphertext`, `wrapped_dek`, `key_id`, `created_at`, `rotated_at` | Envelope encryption: a DEK per secret, wrapped by the KEK from `JURY_MASTER_KEY_FILE`; `key_id` supports rotation (`jury-forge rotate-key`). Holds the GitHub App private key, client and webhook secrets, provider keys, and the receipt signing key. |
| `audit_events` | MVP | `id`, `org_id`, `actor_type`, `actor_id`, `action`, `target_type`, `target_id`, `before`, `after`, `request_id`, `turn_id`, `ip`, `at` | Append-only (trigger); redacted; exportable. |
| `memberships` / `role_bindings` | v1.2 | `org_id`, `principal`, `role`, `scope` | The admin, SME, member, viewer, and auditor roles (ADR-0008, ADR-0016). In v1, maintainer and reader are derived from GitHub repo access at request time and are not stored as grants (`session-capacity-and-visibility` §4). |
| `api_tokens` | v1.2 | `id`, `org_id`, `user_id`, `name`, `token_hash`, `scopes`, `expires_at`, `last_used_at` | The API/CLI surface is v1.2 (`session-capacity-and-visibility`, release tiers). |

## Forge

| Table | Tier | Key fields | Notes |
| ----- | ---- | ---------- | ----- |
| `installations` | MVP | `id`, `org_id`, `forge` (`github`), `external_id`, `account_login`, `account_type`, `base_url`, `app_secret_ids`, `status`, `created_at` | `base_url` leaves room for GHES (v1.1). App credentials are rows in `secrets`. |
| `repositories` | MVP | `id`, `org_id`, `installation_id`, `external_id`, `full_name`, `private`, `default_branch`, `language`, `created_at` | No enable toggle (ADR-0013); review is manual-first and automatic review is config-as-code. |
| `webhook_deliveries` | MVP | `id`, `org_id`, `installation_id`, `delivery_id`, `event`, `action`, `payload_artefact_id`, `received_at`, `processed_at`, `status` | Unique `delivery_id`; inserted in the same transaction as its job (technical-approach §5.1). The raw payload is an artefact, kept 30 days. |

## Providers and models

| Table | Tier | Key fields | Notes |
| ----- | ---- | ---------- | ----- |
| `providers` | MVP | `id`, `org_id`, `kind` (`openai_compatible`/`anthropic_compatible`/`local`), `name`, `base_url`, `allowed_origin`, `pinned_addresses`, `secret_id`, `status`, `created_at`, `last_verified_at` | Keys are write-only and origin-bound (ADR-0011). `pinned_addresses` applies only to the `local` kind (ADR-0030). |
| `provider_models` | MVP | `id`, `provider_id`, `model_id`, `display_name`, `context_window`, `max_output`, `input_price`, `output_price`, `cache_read_price`, `cache_write_price`, `capabilities`, `supported_endpoints`, `pricing_source`, `source`, `status`, `last_seen_at` | Fetched from `/models` and enriched from the bundled registry snapshot. A binding can only name a row here (no free-text model IDs). |
| `model_probes` | MVP | `id`, `provider_id`, `model_id`, `endpoint`, `probe_version`, `sdk_version`, `status` (`passed`/`failed`/`running`), `chosen_mode`, `mode_results`, `reasoning_share`, `cache_read_seen`, `tokens_used`, `triggered_by`, `actor_id`, `started_at`, `finished_at` | ADR-0029. A binding needs a `passed` probe for its provider, model, endpoint, and current probe version. Synthetic fixtures only. |

## Reviewers

| Table | Tier | Key fields | Notes |
| ----- | ---- | ---------- | ----- |
| `reviewers` | MVP | `id`, `org_id`, `slug`, `name`, `role` (`security`/`correctness`/`tests`/…), `built_in`, `status`, `created_at`, `archived_at` | MVP binds one juror; v1 ships three built-in jurors (Security, Correctness, Tests) plus the non-voting verifier (ADR-0025). |
| `reviewer_versions` | MVP | `id`, `reviewer_id`, `version`, `prompt_file_id`, `prompt_hash`, `instructions`, `model_role` (`reasoning`/`fast`), `provider_model_id` (override), `params`, `output_schema`, `content_hash`, `created_by`, `created_at`, `activated_at` | Immutable once active. The factory default is a versioned prompt file; an operator edit creates a new version (technical-approach §16). |
| `model_role_bindings` | v1 | `org_id`, `role` (`reasoning`/`fast`), `provider_model_id`, `updated_by`, `updated_at` | ADR-0025 §5. A reviewer may override `reasoning`. |
| `reviewer_repo_bindings` | MVP | `id`, `repo_id`, `reviewer_id`, `reviewer_version_id`, `enabled`, `selection` (`required`/`default`; `capability` is v1.2), `paths_include`, `paths_exclude`, `languages`, `budget`, `created_by`, `updated_at` | The binding is the enablement: no reviewer runs on a repo without an enabled binding, and the Check Run appears on PR open only in a bound repo (ADR-0013, ADR-0016, `agentic-review-sessions` §6). The MVP has one built-in reviewer and one binding; v1 adds path/language scopes for the three jurors. Added to technical-approach §17 on 2026-11-28. |
| `capabilities`, `capability_labels`, `reviewer_capabilities`, `reviewer_approvals`, `fallback_comments` | v1.2 | — | The capability registry and `jury:cap:*` labels (ADR-0016, capabilities.md v1.2). |

## Sessions and turns

| Table | Tier | Key fields | Notes |
| ----- | ---- | ---------- | ----- |
| `pr_sessions` | MVP | `id`, `org_id`, `installation_id`, `repository_id`, `pr_number`, `state`, `generation`, `needs_human_reason`, `last_turn_at`, `archived_at` | One per `(installation_id, repository_id, pr_number)`. `state` = `created`/`active`/`waiting_for_user`/`resolved`/`archived` (`session-capacity-and-visibility` §2). |
| `session_threads` | MVP | `id`, `session_id`, `github_thread_id`, `file`, `line`, `created_by`, `owner_reviewer_id`, `state`, `resolved_by`, `resolved_at` | One per review-comment thread; only bot-owned threads can be bot-resolved (`auto`). |
| `session_messages` | MVP | `id`, `session_id`, `thread_id`, `role` (`user`/`agent`/`system`), `reviewer_version_id`, `github_comment_id`, `author_login`, `created_at` | Append-only; the body lives in `message_versions`. |
| `message_versions` | MVP | `id`, `session_message_id`, `body_hash`, `body`, `observed_at`, `answered_by_turn_id` | ADR-0024 §3; a turn answers one version. |
| `session_turns` | MVP | `id`, `session_id`, `generation`, `trigger`, `intent`, `status` (`queued`/`running`/`completed`/`failed`/`superseded`/`budget_stopped`), `config_snapshot`, `cost_micros`, `tokens`, `started_at`, `finished_at` | The durable unit of work, serialized per session by the queue (`queue_name = session:<id>`). `config_snapshot` freezes reviewer versions, prompt hashes, instruction-file hashes, and model bindings. |
| `turn_steps` | MVP | `turn_id`, `step`, `input_hash`, `output`, `tokens`, `ms`, `created_at` | Unique `(turn_id, step)`. A retried job reads finished steps back instead of redoing them (technical-approach §3.3). Large outputs reference an artefact. |
| `session_findings` | MVP | `id`, `session_id`, `thread_id`, `turn_id`, `reviewer_version_id`, `fingerprint`, `category`, `severity`, `file`, `line`, `start_line`, `anchor_hash`, `status`, `evidence`, `confidence`, `external_id` | `status` = `open`/`fix_candidate`/`verified_fixed`/`outdated`/`addressed`/`dismissed`/`resolved`/`reopened` (ADR-0024). `external_id` is the GitHub comment ID used for idempotent publishing. |
| `finding_fingerprints` | MVP | `fingerprint`, `repository_id`, `category`, `path`, `anchor_hash`, `first_seen_turn_id`, `last_state` | ADR-0024 §4; unique `(repository_id, fingerprint)`. Code-assigned only. |
| `coverage_manifests` | MVP | `id`, `turn_id`, `files` (path, state `reviewed`/`expanded`/`summarised`/`skipped`/`excluded`, reason, tokens) | ADR-0025 §2; part of the receipt. `expanded` appears from v1 (T0+). |
| `resolutions` | MVP | `id`, `thread_id`, `actor_type`, `actor_id`, `mode` (`suggest`/`auto`/`off`), `evidence`, `confidence`, `created_at` | In `suggest`, the actor is the human who resolved; in `auto`, the bot resolution is guarded (ADR-0024 §6). |
| `finding_feedback` | MVP | `finding_id`, `user_id`, `source` (`button`/`reaction`), `verdict` (`helpful`/`wrong`/`fixed`/`duplicate`), `reason`, `created_at` | The learning loop; reactions are polled (cron). |
| `session_findings` jury and verifier columns | v1 | `agreement`, `jurors`, `verifier_verdict` (`confirmed`/`unconfirmed`/`wrong`), `verifier_reason` | ADR-0025 §4. |
| `appeals` | v1 | `id`, `finding_id`, `appellant_user_id`, `argument_message_id`, `outcome` (`upheld`/`downgraded`/`withdrawn`/`escalated`), `votes`, `turn_id` | S1; one appeal per finding. |
| `suppressions` | v1 | `id`, `repository_id`, `fingerprint`, `category`, `path_glob`, `reason`, `source` (`feedback`/`appeal`/`reaction`), `created_by`, `expires_at`, `revoked_at` | S4; never applies to `critical`. |
| `repo_facts` | v1 | `id`, `repository_id`, `text`, `source_appeal_id`, `confirmed_by`, `confirmed_at`, `expires_at` | S4 positive memory; human-confirmed only. |
| `review_receipts` | v1 | `id`, `turn_id`, `canonical_json`, `hash`, `prev_hash`, `signature`, `key_id`, `created_at` | S5; RFC 8785 JCS, Ed25519, an append-only hash chain per installation. |
| `jury_charges` | v1 | `id`, `repository_id`, `charge_id`, `text`, `source_sha` | S12; read from the base-SHA `.jury-forge.yml`. |
| `charge_results` | v1 | `id`, `turn_id`, `charge_id`, `result` (`pass`/`fail`/`n_a`), `evidence` | S12; Check Run line items. |
| `tool_calls` | v1.1 | `id`, `turn_id`, `reviewer_version_id`, `tool`, `input`, `output`, `tokens`, `latency_ms`, `status` | Branch review only; PR review runs no model tool loop (technical-approach §3.4). |

### Session invariants

1. One `pr_sessions` row per `(installation_id, repository_id, pr_number)`.
2. One running turn per session: the queue serializes by `queue_name = session:<id>`, and replies
   inside the 30 s debounce window coalesce into one turn (`job_key` replace mode).
3. A turn carries `(session_id, generation)`; a step aborts as `superseded` when the generation has
   moved (ADR-0024).
4. A `session_threads` row is resolved by a human natively or in the UI (`suggest`/`off`), or by the
   bot in `auto`; a bot resolution needs a `resolutions` row with evidence and a prior human message.
5. A reviewer version references a `provider_models` row through its model role or override; a
   removed model marks the reviewer `configuration_error`.
6. Session visibility never exceeds repo visibility: a reader must have repo access on GitHub. The
   session belongs to the PR, not the user who triggered it.

## Artefacts, budgets, and usage

| Table | Tier | Key fields | Notes |
| ----- | ---- | ---------- | ----- |
| `artefacts` | MVP | `id`, `org_id`, `kind` (`diff`/`provider_request`/`provider_response`/`webhook_payload`/`export`), `bytes` (`bytea`), `size`, `sha256`, `redacted`, `created_at`, `expires_at` | ≤ 2 MB each; the daily retention job deletes expired rows (technical-approach §3.2). Never logged, never a span attribute. |
| `budgets` | MVP | `id`, `org_id`, `scope_type` (`session`/`repo`/`installation`/`requester`), `scope_id`, `period` (`turn`/`day`/`week`/`month`), `token_limit`, `cost_limit_micros`, `action` (`warn`/`block`), `created_at` | ADR-0024 §7 hard budgets fail closed; checked in `domain` before every model call. |
| `usage_rollups` | MVP | `org_id`, `scope_type`, `scope_id`, `period_start`, `tokens`, `cost_micros`, `turns` | Materialised for the dashboard and the scorecard. |

## Repository graph (v1.1) and knowledge (v1.2)

| Table | Tier | Notes |
| ----- | ---- | ----- |
| `repo_indexes`, `index_nodes`, `index_edges` | v1.1 | Postgres adjacency tables per `(repository, commit)` for branch review (ADR-0014); derived, rebuildable, never store secrets. |
| `context_manifests` | v1.1 | What a branch-review turn saw from the graph; PR review uses `coverage_manifests`. |
| `knowledge_sources`, `packs`, `pack_versions`, `pack_documents`, `pack_grants`, `knowledge_snapshots`, `knowledge_citations`, `reviewer_knowledge_bindings` | v1.2 | Knowledge packs, doc links, grants, and retrieval (ADR-0017). The single org conventions pack in v1 is an instruction source recorded in the turn's `config_snapshot` and the receipt. |

## Not in the schema

- **Queue tables** (`jobs`, `dead_letters`, `outbox`): graphile-worker owns its schema; a job that
  exhausts its attempts stays there as permanently failed, inspectable, and retryable by an admin
  with audit (ADR-0006). The transactional outbox is `add_job` in the same transaction.
- **A separate run model** (`review_requests`, `runs`, `run_steps`, `review_publications`,
  `provider_calls`): a review is a `session_turn`; its steps are `turn_steps`; model requests and
  responses are artefacts referenced from `turn_steps.output`; publish idempotency is
  `session_findings.external_id` plus the `(turn_id, 'publish')` step result.
- **Agent tables** (`agent_definitions`, `agent_versions`, `agent_scopes`): reviewers are the only
  agent definition.

## Retention and deletion

Defaults (Q-046, `security.md` §10), all configurable:

- Raw model requests and responses (artefacts): **30 days**.
- Webhook payloads: 30 days.
- Findings, sessions, and receipts: 1 year.
- Audit: 1 year; exportable.
- Idempotency records (`webhook_deliveries`, `turn_steps`): at least the forge's retry window plus the
  retention of the related turn.
- Deleting an organisation cascades through all tenant rows, artefacts included; the operation is
  audited and confirmed.

## Why this is not the PoC schema

| PoC | Target | Reason |
| --- | ------ | ------ |
| One `github_app` row with plaintext-adjacent secrets | `installations` + envelope-encrypted `secrets` | GHES later, key rotation |
| Mutable `reviewers` | `reviewers` + `reviewer_versions` | Reproducibility, rollback, prompt hashes |
| `runs` without steps | `session_turns` + `turn_steps` | Durable sessions, observability, idempotency |
| Findings embedded as JSON | `session_findings` + `finding_fingerprints` | Feedback, dedup, re-anchoring |
| `activity_log` | `audit_events` (append-only) + a derived activity feed | Compliance and export |
| No budgets | `budgets` + `usage_rollups` | Cost control |
| Byte fields | Token estimates + the model catalog | Model-aware budgets |
| A Durable Object per run | graphile-worker jobs + session rows | Reliability and serialization |
| No tenant column | `org_id` everywhere | Teams and isolation |
