# Target data model

Conceptual model for the reference implementation (PostgreSQL). It is deliberately richer than
the PoC: tenancy, versioning, idempotency, audit, budgets, and run snapshots are first-class.

> **Status:** proposed. The exact DDL follows the storage ADR. Names are normative for docs and
> contracts; column types are indicative.

## Design rules

1. **Every row is tenant-scoped** (directly or through a parent). A query without a tenant scope is
   a bug.
2. **Configuration is versioned.** A run references the exact reviewer/policy/pack versions it
   used. Mutation never rewrites history.
3. **Facts and artefacts are separate.** Postgres holds facts; object storage holds bytes (raw
   diffs, provider responses, reports, exports).
4. **Every long-running thing has a lease and a heartbeat.** No immortal `running` state.
5. **Every external effect has an idempotency key.** Publishing, forge calls, provider calls.
6. **Audit is append-only.** Activity is a derived, best-effort feed.
7. **Deletion is explicit and cascading.** Retention is a policy, not an afterthought.

## Tenancy and identity

| Entity | Key fields | Notes |
| ------ | ---------- | ----- |
| `organizations` | `id`, `slug`, `name`, `created_at` | The tenant. Single-operator mode is an org with one member. |
| `users` | `id`, `login`, `email`, `display_name`, `avatar_url`, `created_at` | Identity from GitHub OAuth/OIDC. |
| `memberships` | `org_id`, `user_id`, `role`, `created_at` | Roles: owner, admin, maintainer, viewer, auditor. |
| `sessions` | `id`, `user_id`, `token_hash`, `expires_at`, `revoked_at`, `last_seen_at` | Hashed tokens; revocation; optional device metadata. |
| `api_tokens` | `id`, `org_id`, `user_id`, `name`, `token_hash`, `scopes`, `expires_at`, `last_used_at` | Automation; scoped; revocable. |
| `audit_events` | `id`, `org_id`, `actor_type`, `actor_id`, `action`, `target_type`, `target_id`, `before`, `after`, `request_id`, `run_id`, `ip`, `at` | Append-only; redacted; exportable. |

## Forge integration

| Entity | Key fields | Notes |
| ------ | ---------- | ----- |
| `forge_installations` | `id`, `org_id`, `forge` (`github`/`gitea`/…), `external_id`, `account_login`, `account_type`, `base_url`, `status`, `created_at` | Multiple installations per org. `base_url` supports GHES. |
| `forge_credentials` | `id`, `installation_id`, `kind`, `ciphertext`, `key_version`, `created_at`, `rotated_at` | App private key, webhook secret, client secret; envelope-encrypted. |
| `repositories` | `id`, `installation_id`, `external_id`, `full_name`, `private`, `default_branch`, `language`, `enabled`, `created_at` | `external_id` unique per forge. |
| `webhook_events` | `id`, `installation_id`, `forge`, `delivery_id`, `event`, `action`, `payload_ref`, `received_at`, `processed_at`, `status` | Raw payload in object storage; idempotent on `(forge, delivery_id)`. |
| `outbox` | `id`, `org_id`, `topic`, `payload`, `created_at`, `published_at`, `attempts` | Transactional outbox for queue publishing. |

## Review configuration

| Entity | Key fields | Notes |
| ------ | ---------- | ----- |
| `reviewers` | `id`, `org_id`, `name`, `slug`, `description`, `created_by`, `created_at`, `archived_at` | Stable identity. No mutable prompt here. |
| `reviewer_versions` | `id`, `reviewer_id`, `version`, `status` (`draft`/`active`/`archived`), `instructions`, `rules`, `model`, `provider`, `params`, `output_schema`, `tool_policy`, `content_hash`, `created_by`, `created_at`, `activated_at` | Immutable once active. A run references a version. |
| `provider_credentials` | `id`, `org_id`, `name`, `provider`, `base_url`, `allowed_origins`, `ciphertext`, `key_version`, `created_at`, `last_used_at` | Credential is bound to allowed origins. No copy-to-arbitrary-URL. |
| `reviewer_bindings` | `reviewer_version_id`, `provider_credential_id`, `model`, `params`, `budget` | Explicit binding, replaceable. |
| `policies` | `id`, `org_id`, `scope_type` (`org`/`repo`/`branch`/`path`), `scope_id`, `version`, `config`, `created_by`, `created_at` | Validated by schema; versioned. |

Policy config covers: required/optional reviewers, severity thresholds, inline caps, publish mode,
token/cost budgets, model allowlist, data policy, fork policy, suppression rules, and preview/approve.

## Runs

| Entity | Key fields | Notes |
| ------ | ---------- | ----- |
| `review_requests` | `id`, `org_id`, `repository_id`, `pr_number`, `head_sha`, `base_sha`, `event`, `mode` (`auto`/`manual`/`replay`), `requested_by`, `created_at` | One per webhook/try; enqueues a run. |
| `runs` | `id`, `org_id`, `request_id`, `repository_id`, `pr_number`, `head_sha`, `generation`, `status`, `phase`, `attempt`, `lease_owner`, `lease_expires_at`, `heartbeat_at`, `error_code`, `error_detail`, `started_at`, `finished_at`, `canceled_at` | `status`: queued, running, completed, failed, canceled, skipped. `generation` orders runs per PR. |
| `run_steps` | `id`, `run_id`, `name`, `status`, `attempt`, `started_at`, `finished_at`, `error`, `metrics`, `output_ref` | One row per step attempt; idempotent by `(run_id, name, attempt)`. |
| `run_config_snapshot` | `run_id`, `reviewer_versions`, `policy_version`, `pack_versions`, `model_registry`, `prompt_hashes`, `context_budget` | JSON; the exact configuration used. |
| `run_context` | `run_id`, `manifest`, `included_files`, `omitted_files`, `tokens`, `bytes`, `artefact_ref` | What the model saw and why. |
| `provider_calls` | `id`, `run_id`, `reviewer_version_id`, `provider`, `model`, `request_hash`, `response_ref`, `prompt_tokens`, `completion_tokens`, `cost_micros`, `latency_ms`, `status`, `error`, `created_at` | Raw request/response in object storage, redacted as configured. |
| `findings` | `id`, `run_id`, `reviewer_version_id`, `file`, `line`, `start_line`, `severity`, `title`, `body`, `confidence`, `evidence`, `fingerprint`, `status` (`published`/`summary`/`dropped`/`unverified`), `created_at` | Stable fingerprint for cross-run tracking. |
| `finding_feedback` | `finding_id`, `user_id`, `verdict` (`helpful`/`wrong`/`fixed`/`duplicate`), `reason`, `created_at` | The learning loop. |
| `review_publications` | `id`, `run_id`, `forge`, `external_review_id`, `idempotency_key`, `status`, `published_at`, `error` | Exactly-once publish. |

## Knowledge

| Entity | Key fields | Notes |
| ------ | ---------- | ----- |
| `packs` | `id`, `org_id`, `slug`, `name`, `created_at`, `archived_at` | Stable identity. |
| `pack_versions` | `id`, `pack_id`, `hash`, `manifest`, `body`, `bytes`, `token_estimate`, `signature`, `created_by`, `created_at` | Immutable; unique `(pack_id, hash)`. |
| `pack_documents` | `id`, `version_id`, `path`, `bytes`, `tokens`, `text`, `never_quote` | Only manifest + docs. |
| `pack_grants` | `id`, `pack_id`, `scope_type`, `scope_id`, `precedence`, `pinned_version_id`, `enabled`, `created_at` | Global/repo/reviewer; pin or latest. |
| `pack_chunks` | `id`, `version_id`, `path`, `chunk_index`, `text`, `tokens`, `embedding_ref` | For relevance retrieval (optional). |

## Budgets and usage

| Entity | Key fields | Notes |
| ------ | ---------- | ----- |
| `budgets` | `id`, `org_id`, `scope_type`, `scope_id`, `period` (`day`/`week`/`month`), `token_limit`, `cost_limit_micros`, `action` (`warn`/`block`), `created_at` | Hard or soft. |
| `usage_rollups` | `org_id`, `scope_type`, `scope_id`, `period_start`, `tokens`, `cost_micros`, `runs` | Materialised for dashboards. |
| `model_registry` | `provider`, `model`, `context_window`, `max_output`, `tokenizer`, `input_price`, `output_price`, `capabilities`, `updated_at` | Operator-overridable. |

## Operations

| Entity | Key fields | Notes |
| ------ | ---------- | ----- |
| `jobs` | `id`, `queue`, `kind`, `payload`, `status`, `priority`, `run_at`, `attempts`, `max_attempts`, `lease_owner`, `lease_expires_at`, `last_error` | Or an external queue; the contract is the same. |
| `dead_letters` | `id`, `job_id`, `reason`, `payload`, `created_at`, `replayed_at` | Operator replay. |
| `diagnostics` | `id`, `org_id`, `kind`, `payload`, `created_at`, `expires_at` | Support bundle metadata. |
| `retention_policies` | `org_id`, `data_class`, `retain_days`, `action` | Runs, prompts, raw responses, audit, packs. |

## Relationships (simplified)

```
organizations ─┬─< memberships >─ users
               ├─< forge_installations ─< repositories
               ├─< reviewers ─< reviewer_versions ─< reviewer_bindings >─ provider_credentials
               ├─< policies
               ├─< packs ─< pack_versions ─< pack_documents / pack_chunks
               ├─< budgets / usage_rollups
               └─< review_requests ─< runs ─┬─< run_steps
                                            ├─< provider_calls
                                            ├─< findings ─< finding_feedback
                                            └─< review_publications
audit_events (org-scoped, append-only, references actors/targets by id)
jobs / dead_letters (operational, org-scoped)
```

## Key invariants

1. `(forge, delivery_id)` is unique in `webhook_events`.
2. `(run_id, name, attempt)` is unique in `run_steps`.
3. `(run_id)` is unique in `review_publications` for a successful publish; `idempotency_key` is
   unique.
4. A `run` can reference only `active` or `archived` reviewer versions; an active version is
   immutable.
5. A `pack_version` is immutable; `(pack_id, hash)` is unique.
6. A `finding` must reference a file and a line that exist at the run's `head_sha`, or be marked
   `unverified`.
7. Every mutating API request writes an `audit_event`.
8. Every `job` has a lease; a lease expiry is recoverable by the janitor.
9. A tenant-scoped query must include `org_id`; row-level security is a defense in depth.

## Retention and deletion

- Raw prompts/responses: configurable, default 90 days.
- Findings and summaries: keep until the repository/run is deleted or retention says otherwise.
- Audit: keep for the configured compliance window (default 1 year; exportable).
- Webhook payloads: 30 days.
- Idempotency records: at least as long as the forge's retry window plus the retention of the
  related run.
- Deleting an organisation cascades through all tenant data and object-storage prefixes; the
  operation is audited and confirmed.

## Why this is not the PoC schema

| PoC | Target | Reason |
| --- | ------ | ------ |
| One `github_app` row | Multiple installations + credentials | Teams, GHES, multi-org |
| Mutable `reviewers` | `reviewers` + `reviewer_versions` | Reproducibility, rollback, prompt hashes |
| `runs` without steps | `runs` + `run_steps` + `provider_calls` | Observability and idempotency |
| Findings embedded as JSON | `findings` rows | Feedback, dedup, fingerprints, queries |
| `activity_log` | `audit_events` + activity feed | Compliance and export |
| No budgets | `budgets` + `usage_rollups` | Cost control |
| Byte fields | Token estimates + model registry | Model-aware budgets |
| No job table | `jobs` + `dead_letters` | Reliability and replay |
| No tenant column | `org_id` everywhere | Teams and isolation |
